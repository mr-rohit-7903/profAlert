// parser.js – ProfAlert v3.0 – Local regex/heuristic email parser
// Zero external dependencies. Extracts exams, dates, times, courses, locations.

/**
 * Main entry point. Parse an email object and return an array of exam events.
 * @param {{ subject: string, body: string, sender: string }} email
 * @returns {Array<{ title: string, course: string, date: string|null, time: string|null, duration: number, location: string|null, notes: string|null }>}
 */
function parseEmailForExams(email) {
    const text = (email.subject || "") + "\n" + (email.body || "");
    if (!text.trim()) return [];

    // 1. Split into logical segments (paragraphs / sentences)
    const segments = splitSegments(text);

    // 2. Find segments that mention exams
    const examSegments = segments.filter(s => scoreExamRelevance(s) > 0);
    if (!examSegments.length) return [];

    // 3. Extract course info from the full email (often in subject or header)
    const globalCourse = extractCourse(text);

    // 4. Extract events from relevant segments
    const events = [];
    const seenDates = new Set();

    for (const seg of examSegments) {
        const dates = extractDates(seg);
        const times = extractTimes(seg);
        const examType = extractExamType(seg) || extractExamType(email.subject) || "Exam";
        const segCourse = extractCourse(seg);
        const course = (segCourse.code || segCourse.name) ? segCourse : globalCourse;
        const location = extractLocation(seg);
        const notes = extractNotes(seg);
        const duration = extractDuration(seg) || guessDuration(times) || 90;

        if (dates.length === 0) {
            // No date found but segment is exam-relevant — create one event with null date
            const key = `${examType}|${course.code}|null`;
            if (!seenDates.has(key)) {
                seenDates.add(key);
                events.push({
                    title: buildTitle(examType, course),
                    course: course.name || course.code || "",
                    date: null,
                    time: times.length ? times[0].start : null,
                    duration,
                    location,
                    notes,
                    emailBody: text
                });
            }
        } else {
            for (const d of dates) {
                const key = `${examType}|${course.code}|${d}`;
                if (seenDates.has(key)) continue;
                seenDates.add(key);
                events.push({
                    title: buildTitle(examType, course),
                    course: course.name || course.code || "",
                    date: d,
                    time: times.length ? times[0].start : null,
                    duration,
                    location,
                    notes,
                    emailBody: text
                });
            }
        }
    }

    // If we have events with dates, drop any dateless events (they are likely
    // intro/summary paragraphs like "schedule for the Class Tests...")
    const hasDated = events.some(e => e.date !== null);
    const filtered = hasDated ? events.filter(e => e.date !== null) : events;

    return deduplicateEvents(filtered);
}

// ─── Segmentation ──────────────────────────────────────────────────────────

function splitSegments(text) {
    // Split on double newlines (paragraphs), then on sentence-ending punctuation
    const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
    const segments = [];
    for (const p of paragraphs) {
        // Keep short paragraphs as-is, split long ones into sentences
        if (p.length < 300) {
            segments.push(p.trim());
        } else {
            const sentences = p.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
            segments.push(...sentences.map(s => s.trim()));
        }
    }
    return segments.filter(Boolean);
}

// ─── Exam Relevance Scoring ────────────────────────────────────────────────

const EXAM_KEYWORDS = [
    { pattern: /\b(class\s*test|ct[\s-]?\d)/i, weight: 10 },
    { pattern: /\b(mid[\s-]?sem(ester)?|mid[\s-]?term)/i, weight: 10 },
    { pattern: /\b(end[\s-]?sem(ester)?|final[\s-]?exam)/i, weight: 10 },
    { pattern: /\bexam(ination)?\b/i, weight: 8 },
    { pattern: /\bquiz\b/i, weight: 8 },
    { pattern: /\bviva(\s*voce)?\b/i, weight: 8 },
    { pattern: /\btest\s*\d/i, weight: 8 },
    { pattern: /\bassignment\b/i, weight: 5 },
    { pattern: /\bdeadline\b/i, weight: 5 },
    { pattern: /\bsubmission\b/i, weight: 4 },
    { pattern: /\bscheduled\b/i, weight: 3 },
    { pattern: /\bsyllabus\b/i, weight: 3 },
    { pattern: /\bportion\b/i, weight: 3 },
    { pattern: /\bmarks?\b/i, weight: 2 },
    { pattern: /\bwill\s+be\s+held\b/i, weight: 6 },
    { pattern: /\bconducted\b/i, weight: 4 },
    { pattern: /\bdate\s*:/i, weight: 5 },
    { pattern: /\btime\s*:/i, weight: 3 },
    { pattern: /\bvenue\s*:/i, weight: 3 },
];

function scoreExamRelevance(text) {
    let score = 0;
    for (const kw of EXAM_KEYWORDS) {
        if (kw.pattern.test(text)) score += kw.weight;
    }
    return score;
}

// ─── Date Extraction ───────────────────────────────────────────────────────

const MONTHS = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
};

const DAYS_OF_WEEK = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4,
    friday: 5, fri: 5, saturday: 6, sat: 6
};

function extractDates(text) {
    const dates = [];
    const today = new Date();
    const currentYear = today.getFullYear();

    // Pattern 1: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const p1 = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
    let m;
    while ((m = p1.exec(text)) !== null) {
        const day = parseInt(m[1]), month = parseInt(m[2]) - 1, year = parseInt(m[3]);
        const d = safeDate(year, month, day);
        if (d) dates.push(d);
    }

    // Pattern 2: YYYY-MM-DD
    const p2 = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
    while ((m = p2.exec(text)) !== null) {
        const year = parseInt(m[1]), month = parseInt(m[2]) - 1, day = parseInt(m[3]);
        const d = safeDate(year, month, day);
        if (d) dates.push(d);
    }

    // Pattern 3: "15th March 2025", "March 15, 2025", "15 Mar", "Mar 15"
    const monthNames = Object.keys(MONTHS).join("|");
    const p3 = new RegExp(
        `\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${monthNames})\\s*,?\\s*(\\d{4})?\\b`, "gi"
    );
    while ((m = p3.exec(text)) !== null) {
        const day = parseInt(m[1]);
        const month = MONTHS[m[2].toLowerCase()];
        const year = m[3] ? parseInt(m[3]) : guessYear(month, day, today);
        const d = safeDate(year, month, day);
        if (d) dates.push(d);
    }

    // Pattern 4: "March 15th, 2025" or "March 15"
    const p4 = new RegExp(
        `\\b(${monthNames})\\s+(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})?\\b`, "gi"
    );
    while ((m = p4.exec(text)) !== null) {
        const month = MONTHS[m[1].toLowerCase()];
        const day = parseInt(m[2]);
        const year = m[3] ? parseInt(m[3]) : guessYear(month, day, today);
        const d = safeDate(year, month, day);
        if (d) dates.push(d);
    }

    // Pattern 5: DD/MM (no year)
    const p5 = /\b(\d{1,2})[\/\-](\d{1,2})\b/g;
    while ((m = p5.exec(text)) !== null) {
        // Skip if already matched by pattern 1 (has year)
        const fullMatch = text.substring(m.index, m.index + 15);
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-.]\d{4}/.test(fullMatch)) continue;
        const day = parseInt(m[1]), month = parseInt(m[2]) - 1;
        const year = guessYear(month, day, today);
        const d = safeDate(year, month, day);
        if (d) dates.push(d);
    }

    // Pattern 6: Relative days — "tomorrow", "day after tomorrow"
    if (/\btomorrow\b/i.test(text)) {
        const d = new Date(today); d.setDate(d.getDate() + 1);
        dates.push(formatDateISO(d));
    }
    if (/\bday\s+after\s+tomorrow\b/i.test(text)) {
        const d = new Date(today); d.setDate(d.getDate() + 2);
        dates.push(formatDateISO(d));
    }

    // Pattern 7: Day names — "next Monday", "this Friday", "on Wednesday"
    const dayPattern = new RegExp(
        `\\b(?:next|this|coming|on)?\\s*(${Object.keys(DAYS_OF_WEEK).join("|")})\\b`, "gi"
    );
    while ((m = dayPattern.exec(text)) !== null) {
        const targetDay = DAYS_OF_WEEK[m[1].toLowerCase()];
        const isNext = /next/i.test(m[0]);
        const d = getNextDayOfWeek(today, targetDay, isNext);
        dates.push(formatDateISO(d));
    }

    // Deduplicate
    return [...new Set(dates)];
}

function guessYear(month, day, today) {
    const currentYear = today.getFullYear();
    const candidate = new Date(currentYear, month, day);
    // If the date is more than 30 days in the past, assume next year
    if (candidate < today && (today - candidate) > 30 * 86400000) {
        return currentYear + 1;
    }
    return currentYear;
}

function safeDate(year, month, day) {
    if (month < 0 || month > 11 || day < 1 || day > 31 || year < 2020 || year > 2030) return null;
    const d = new Date(year, month, day);
    if (d.getMonth() !== month) return null; // Invalid date (e.g., Feb 30)
    return formatDateISO(d);
}

function formatDateISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

function getNextDayOfWeek(from, targetDay, forceNext) {
    const d = new Date(from);
    let diff = targetDay - d.getDay();
    if (diff <= 0 || forceNext) diff += 7;
    d.setDate(d.getDate() + diff);
    return d;
}

// ─── Time Extraction ───────────────────────────────────────────────────────

function extractTimes(text) {
    const times = [];

    // Pattern 0 (PRIORITY): Time ranges like "6:30 - 8 PM", "6:30 - 8:00 PM"
    // The first time borrows AM/PM from the second
    const pRange = /\b(\d{1,2})(?::(\d{2}))?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM|a\.m\.|p\.m\.)\b/gi;
    let m;
    while ((m = pRange.exec(text)) !== null) {
        const ampm = m[5].replace(/\./g, "").toLowerCase();
        // Parse end time
        let h2 = parseInt(m[3]);
        const min2 = m[4] ? parseInt(m[4]) : 0;
        if (ampm === "pm" && h2 < 12) h2 += 12;
        if (ampm === "am" && h2 === 12) h2 = 0;
        // Parse start time — infer same AM/PM from end time
        let h1 = parseInt(m[1]);
        const min1 = m[2] ? parseInt(m[2]) : 0;
        if (ampm === "pm" && h1 < 12) h1 += 12;
        if (ampm === "am" && h1 === 12) h1 = 0;
        // If start > end after conversion (e.g. "11:00 - 1 PM"), start was actually AM
        if (h1 > h2) h1 -= 12;
        times.push({ start: `${String(h1).padStart(2, "0")}:${String(min1).padStart(2, "0")}`, raw: m[0] });
        times.push({ start: `${String(h2).padStart(2, "0")}:${String(min2).padStart(2, "0")}`, raw: m[0] });
    }

    // Pattern 1: "6:30 PM", "10:00 AM", "6:30PM", "10 AM"
    const p1 = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM|a\.m\.|p\.m\.)\b/gi;
    while ((m = p1.exec(text)) !== null) {
        let h = parseInt(m[1]);
        const min = m[2] ? parseInt(m[2]) : 0;
        const ampm = m[3].replace(/\./g, "").toLowerCase();
        if (ampm === "pm" && h < 12) h += 12;
        if (ampm === "am" && h === 12) h = 0;
        const timeStr = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        // Only add if not already captured by the range pattern
        if (!times.some(t => t.start === timeStr)) {
            times.push({ start: timeStr, raw: m[0] });
        }
    }

    // Pattern 2: "1800 hrs", "18:00 hrs"
    const p2 = /\b(\d{2}):?(\d{2})\s*(?:hrs?|hours?)\b/gi;
    while ((m = p2.exec(text)) !== null) {
        const h = parseInt(m[1]), min = parseInt(m[2]);
        if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
            const timeStr = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
            if (!times.some(t => t.start === timeStr)) {
                times.push({ start: timeStr, raw: m[0] });
            }
        }
    }

    // Deduplicate by start time
    const seen = new Set();
    return times.filter(t => {
        if (seen.has(t.start)) return false;
        seen.add(t.start);
        return true;
    });
}

// ─── Duration Extraction ───────────────────────────────────────────────────

function extractDuration(text) {
    // "90 minutes", "1 hour", "1.5 hours", "1 hr 30 min"
    let m;
    if ((m = text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:(\d+)\s*(?:minutes?|mins?))?/i))) {
        return Math.round(parseFloat(m[1]) * 60) + (m[2] ? parseInt(m[2]) : 0);
    }
    if ((m = text.match(/(\d+)\s*(?:minutes?|mins?)/i))) {
        return parseInt(m[1]);
    }
    return null;
}

function guessDuration(times) {
    // If there are two times, calculate difference
    if (times.length >= 2) {
        const [h1, m1] = times[0].start.split(":").map(Number);
        const [h2, m2] = times[1].start.split(":").map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff > 0 && diff <= 300) return diff;
    }
    return null;
}

// ─── Course Extraction ─────────────────────────────────────────────────────

function extractCourse(text) {
    let code = null;
    let name = null;

    // Course codes: CS21001, ME 302, MATH-200, EE 40003, HS20001
    const codeMatch = text.match(/\b([A-Z]{2,5})[\s\-]?(\d{3,5})\b/);
    if (codeMatch) {
        code = codeMatch[1] + codeMatch[2];
    }

    // Course name in parentheses near the code: "Mechanics of Solids (ME21003)"
    const parenMatch = text.match(/([A-Z][A-Za-z\s&]{3,40})\s*\([A-Z]{2,5}[\s\-]?\d{3,5}\)/);
    if (parenMatch) {
        name = parenMatch[1].trim();
    }

    // Course name after "Course:" or "Subject:"
    const labelMatch = text.match(/(?:course|subject)\s*:\s*([^\n,;]{3,50})/i);
    if (labelMatch) {
        name = labelMatch[1].trim();
    }

    // Course name after "of" or "for" — look for proper noun phrases
    if (!name) {
        const ofMatch = text.match(/(?:of|for)\s+(?:the\s+)?(?:class\s+tests?\s+of\s+|exams?\s+of\s+)?([A-Z][a-z]+(?:\s+(?:of|and|in)\s+)?(?:[A-Z][a-z]+\s*){0,5})/);
        if (ofMatch) {
            const candidate = ofMatch[1].trim();
            // Filter out false positives
            if (!/^(Class|Test|Quiz|Exam|The|This|That)$/i.test(candidate) && candidate.length > 3) {
                name = candidate;
            }
        }
    }

    return { code: code || "", name: name || "" };
}

// ─── Exam Type Extraction ──────────────────────────────────────────────────

function extractExamType(text) {
    const lc = text.toLowerCase();
    if (/class\s*test|ct[\s-]?\d/i.test(lc)) {
        const num = lc.match(/(?:class\s*test|ct)\s*[\s\-]?(\d)/i);
        return num ? `Class Test ${num[1]}` : "Class Test";
    }
    if (/mid[\s-]?sem(ester)?|mid[\s-]?term/i.test(lc)) return "Mid-Semester Exam";
    if (/end[\s-]?sem(ester)?|final[\s-]?exam/i.test(lc)) return "End-Semester Exam";
    if (/\bquiz\b/i.test(lc)) {
        const num = lc.match(/quiz\s*(\d)/i);
        return num ? `Quiz ${num[1]}` : "Quiz";
    }
    if (/\bviva(\s*voce)?\b/i.test(lc)) return "Viva";
    if (/\btest\s*(\d)\b/i.test(lc)) {
        const num = lc.match(/test\s*(\d)/i);
        return `Test ${num[1]}`;
    }
    if (/\bassignment\b/i.test(lc)) return "Assignment";
    if (/\bdeadline\b/i.test(lc)) return "Deadline";
    if (/\bsubmission\b/i.test(lc)) return "Submission";
    if (/\bexam(ination)?\b/i.test(lc)) return "Exam";
    return null;
}

// ─── Location Extraction ──────────────────────────────────────────────────

function extractLocation(text) {
    let m;

    // "Venue: XYZ", "Room: XYZ", "Hall: XYZ", "Location: XYZ"
    if ((m = text.match(/(?:venue|room|hall|location|place)\s*[:–-]\s*([^\n,;]{2,50})/i))) {
        return m[1].trim();
    }

    // "in Room NC341", "at Vikramshila", "in NR121"
    if ((m = text.match(/(?:in|at)\s+((?:Room\s+)?[A-Z][A-Za-z0-9\s]{1,30}(?:Hall|Room|Lab|Building|Center|Centre|Auditorium|Theatre|Vikramshila|Nalanda|Kalidas|Netaji|Ramanujam)?)/i))) {
        const loc = m[1].trim();
        // Filter out false positives (very common words)
        if (!/^(the|this|that|which|order|case|detail|addition|general|time|mind)$/i.test(loc)) {
            return loc;
        }
    }

    // Room/Hall codes like "NC341", "NR121", "S-301", "F-116"
    if ((m = text.match(/\b([A-Z]{1,3}[\s\-]?\d{2,4})\b/))) {
        // Avoid matching course codes
        if (!/^[A-Z]{2,5}\d{3,5}$/.test(m[1].replace(/[\s-]/g, ""))) {
            const nearLoc = text.substring(Math.max(0, m.index - 40), m.index + m[0].length + 10);
            if (/room|hall|venue|at|in/i.test(nearLoc)) {
                return m[1];
            }
        }
    }

    // Online/Moodle
    if (/\bonline\b/i.test(text)) return "Online";
    if (/\bmoodle\b/i.test(text)) return "Moodle";

    return null;
}

// ─── Notes Extraction ──────────────────────────────────────────────────────

function extractNotes(text) {
    const notes = [];

    // Syllabus / Portion
    let m;
    if ((m = text.match(/(?:syllabus|portion|topics?|chapters?|modules?)\s*[:–-]\s*([^\n]{5,150})/i))) {
        notes.push(m[1].trim());
    }

    // "Chapters 1-5", "Modules 1 to 3"
    if ((m = text.match(/(?:chapters?|modules?|units?)\s+(\d[\d\s,\-to&and]+)/i))) {
        notes.push("Chapters/Modules: " + m[1].trim());
    }

    // Marks info — "50 marks", "out of 20"
    if ((m = text.match(/(\d+)\s*marks/i))) {
        notes.push(m[0]);
    }

    // "Open book", "Closed book"
    if (/open\s*book/i.test(text)) notes.push("Open book");
    if (/closed?\s*book/i.test(text)) notes.push("Closed book");

    return notes.length ? notes.join(" | ") : null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildTitle(examType, course) {
    const parts = [];
    if (course.name) {
        parts.push(course.name);
    } else if (course.code) {
        parts.push(course.code);
    }
    parts.push(examType);
    return parts.join(" — ") || examType;
}

function deduplicateEvents(events) {
    // Remove events that have the same title + date
    const seen = new Set();
    return events.filter(e => {
        const key = `${e.title}|${e.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
