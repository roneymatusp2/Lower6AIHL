import { syllabusData, EXAMS, topicDetails } from './data.js';

// Print functionality
window.addEventListener('beforeprint', function() {
    document.querySelectorAll('.unit-section').forEach(section => {
        section.style.pageBreakInside = 'avoid';
    });
});

// Active navigation state with aria-current
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = Array.from(document.querySelectorAll('.navigation .nav-btn'));
    const sectionById = new Map();
    navLinks.forEach(link => {
        const id = (link.getAttribute('href') || '').slice(1);
        const section = document.getElementById(id);
        if (section) {
            sectionById.set(section, link);
        }
        link.setAttribute('aria-current', 'false');
    });

    const setActive = (section) => {
        navLinks.forEach(l => l.setAttribute('aria-current', 'false'));
        const link = sectionById.get(section);
        if (link) link.setAttribute('aria-current', 'true');
    };

    const observer = new IntersectionObserver((entries) => {
        const visible = entries
            .filter(e => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
            setActive(visible[0].target);
        }
    }, { root: null, rootMargin: '-120px 0px 0px 0px', threshold: [0.25, 0.5, 0.75, 1] });

    document.querySelectorAll('.unit-section').forEach(section => observer.observe(section));

    // British English date formatting across the document
    const monthMap = {
        Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June',
        Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December'
    };
    const fullMonths = Object.values(monthMap);
    const allMonthPattern = '(?:' + fullMonths.join('|') + ')';
    const abbrPattern = '(?:' + Object.keys(monthMap).join('|') + ')';

    const expandAbbreviations = (text) => {
        return text.replace(new RegExp('\\b' + abbrPattern + '\\b', 'g'), (m) => monthMap[m]);
    };

    const reorderAcrossMonths = (text) => {
        const re = new RegExp('(' + allMonthPattern + ')\\s+(\\d{1,2})\\s*[-–]\\s*(' + allMonthPattern + ')\\s+(\\d{1,2})', 'g');
        return text.replace(re, (match, m1, d1, m2, d2) => `${d1} ${m1} – ${d2} ${m2}`);
    };

    const reorderSameMonth = (text) => {
        const re = new RegExp('(' + allMonthPattern + ')\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})', 'g');
        return text.replace(re, (match, m, d1, d2) => `${d1}–${d2} ${m}`);
    };

    const processText = (text) => {
        let t = text;
        t = expandAbbreviations(t);
        t = reorderAcrossMonths(t);
        t = reorderSameMonth(t);
        // Expand month abbreviations in weekday dates like "Monday, 11 Aug"
        t = t.replace(/([A-Za-z]+),\\s*(\\d{1,2})\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b/g,
            (match, dayName, d, abbr) => `${dayName}, ${d} ${monthMap[abbr]}`);
        return t;
    };

    const walkAndFormatDates = (root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                // Skip extremely short nodes
                if (node.nodeValue.trim().length < 6) return NodeFilter.FILTER_REJECT;
                // Only process if any month name or abbreviation appears
                if (/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)/.test(node.nodeValue)) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            }
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(n => {
            const updated = processText(n.nodeValue);
            if (updated !== n.nodeValue) n.nodeValue = updated;
        });
    };

    // Process lesson dates explicitly
    document.querySelectorAll('.lesson-date').forEach(el => {
        el.textContent = processText(el.textContent);
    });

    // Process the rest of the content within the main container
    const container = document.querySelector('.container');
    if (container) walkAndFormatDates(container);

    // Search filter for lessons and topics
    const searchInput = document.getElementById('lesson-search');
    const status = document.getElementById('search-status');
    const rows = Array.from(document.querySelectorAll('.lesson-table tbody tr'));
    const normalise = (s) => (s || '').toLowerCase();
    const updateStatus = (count) => {
        if (!status) return;
        status.textContent = count === rows.length ? '' : `${count} matching row${count === 1 ? '' : 's'}`;
    };
    const filter = (query) => {
        const q = normalise(query);
        let visible = 0;
        rows.forEach(tr => {
            const text = normalise(tr.textContent);
            const match = q.length === 0 || text.includes(q);
            tr.style.display = match ? '' : 'none';
            if (match) visible += 1;
        });
        // Hide empty captions wrappers if entire table has no visible rows
        document.querySelectorAll('.unit-section').forEach(section => {
            const sectionRows = section.querySelectorAll('tbody tr');
            const anyVisible = Array.from(sectionRows).some(r => r.style.display !== 'none');
            section.style.display = anyVisible ? '' : 'none';
        });
        updateStatus(visible);
    };
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filter(e.target.value));
    }

    // ===== Syllabus dashboard =====
    const dashboard = document.getElementById('syllabus-dashboard');
    const summary = document.getElementById('syllabus-summary');
    const autoMark = document.getElementById('auto-mark-past');
    const canonical = (s) => String(s).trim().toUpperCase().replace(/^A/, '');
    const state = JSON.parse(localStorage.getItem('aihl_syllabus_state') || '{}');
    const saveState = (s) => localStorage.setItem('aihl_syllabus_state', JSON.stringify(s));

    const updateSummary = () => {
        if (!summary) return;
        const allCodes = new Set();
        syllabusData.forEach(topic => topic.levels.forEach(level => level.items.forEach(item => allCodes.add(canonical(item.code)))));
        const completed = Object.keys(state).filter(k => state[k] && allCodes.has(canonical(k))).length;
        const total = allCodes.size;
        const pct = total > 0 ? (100 * completed / total).toFixed(1) : 0;
        summary.innerHTML = `<strong>${completed} / ${total}</strong> syllabus points completed (${pct}%)`;
        // Update progress bar
        const progressBar = document.getElementById('syllabus-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${pct}%`;
            progressBar.setAttribute('aria-valuenow', pct);
        }
    };

    const renderSyllabus = () => {
        if (!dashboard) return;
        const frag = document.createDocumentFragment();
        syllabusData.forEach(topic => {
            const topicEl = document.createElement('div');
            topicEl.className = 'topic-container';
            const h3 = document.createElement('h3');
            h3.textContent = topic.topic;
            topicEl.appendChild(h3);
            topic.levels.forEach(level => {
                const levelEl = document.createElement('div');
                levelEl.className = 'level-section';
                const h4 = document.createElement('h4');
                h4.textContent = level.level;
                levelEl.appendChild(h4);
                const grid = document.createElement('div');
                grid.className = 'syllabus-grid';
                level.items.forEach(item => {
                    const code = canonical(item.code);
                    const done = !!state[code];
                    const pill = document.createElement('button');
                    pill.className = 'code-pill';
                    pill.classList.toggle('completed', done);
                    pill.dataset.code = code;
                    pill.textContent = code;
                    pill.setAttribute('aria-pressed', String(done));
                    pill.setAttribute('title', item.text);
                    grid.appendChild(pill);
                });
                levelEl.appendChild(grid);
                topicEl.appendChild(levelEl);
            });
            frag.appendChild(topicEl);
        });
        dashboard.appendChild(frag);
        updateSummary();
    };

    if (dashboard) {
        renderSyllabus();
        dashboard.addEventListener('click', (e) => {
            if (!e.target.matches('.code-pill')) return;
            const pill = e.target;
            const code = pill.dataset.code;
            const current = pill.classList.toggle('completed');
            pill.setAttribute('aria-pressed', String(current));
            state[code] = current;
            saveState(state);
            updateSummary();
            schedulePush();
        });
    }

    // ===== Exam countdown banner =====
    const examBanner = document.getElementById('exam-banner');
    const examDaysEl = document.getElementById('exam-days');
    const examDateEl = document.getElementById('exam-date');
    const examWindowEl = document.getElementById('exam-window');
    const examScopeEl = document.getElementById('exam-scope');

    const buildScheduleMap = () => {
        const map = {};
        document.querySelectorAll('.lesson-table tbody tr').forEach(tr => {
            const dateCell = tr.querySelector('td:first-child .lesson-date');
            if (!dateCell) return;
            const dateStr = dateCell.textContent.trim().split(',')[1]?.trim();
            if (!dateStr) return;
            const codes = Array.from(tr.querySelectorAll('.code-pill')).map(p => p.dataset.code);
            try {
                const d = new Date(dateStr + ' ' + new Date().getFullYear());
                if (!isNaN(d)) codes.forEach(c => { map[c] = d; });
            } catch (e) { /* ignore parse error */ }
        });
        return map;
    };

    const getNextExam = (now) => EXAMS.find(e => e.start > now);

    const formatDateRange = (d1, d2) => {
        const opts = { day: 'numeric', month: 'long' };
        const s1 = d1.toLocaleDateString('en-GB', opts);
        if (d1.getTime() === d2.getTime()) return s1;
        const s2 = d2.toLocaleDateString('en-GB', opts);
        return `${s1} – ${s2}`;
    };

    const collectScope = (examDate) => {
        if (!examScopeEl) return;
        const schedule = buildScheduleMap();
        const scopeCodes = Object.keys(schedule).filter(code => schedule[code] < examDate);
        const uniqueCodes = [...new Set(scopeCodes)].sort();

        if (uniqueCodes.length === 0) {
            examScopeEl.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Syllabus scope for this assessment will be confirmed shortly.</p>';
            return;
        }

        const frag = document.createDocumentFragment();
        const title = document.createElement('h3');
        title.textContent = 'Syllabus Scope';
        title.style.cssText = 'text-align: center; margin-bottom: 1rem; color: var(--primary-red); font-size: 1.2rem;';
        frag.appendChild(title);

        const columnsContainer = document.createElement('div');
        columnsContainer.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;';

        const slCodes = uniqueCodes.filter(c => c.startsWith('SL'));
        const hlCodes = uniqueCodes.filter(c => c.startsWith('HL') || c.startsWith('AHL'));

        if (slCodes.length > 0) {
            const slSection = document.createElement('div');
            slSection.style.cssText = 'background: linear-gradient(135deg, #f9fff8 0%, #f0fff4 100%); border: 1px solid #d1fae5; border-radius: 8px; padding: 1rem;';
            slSection.innerHTML = '<h4 style="margin: 0 0 0.75rem 0; color: var(--primary-green); font-size: 1.1rem; font-weight: 700; border-bottom: 2px solid var(--primary-green); padding-bottom: 0.5rem;">📚 SL Core Topics</h4>';
            const slList = document.createElement('ul');
            slList.style.cssText = 'margin: 0; padding: 0; list-style: none;';

            slCodes.forEach(code => {
                const detail = topicDetails[code];
                if (detail) {
                    const li = document.createElement('li');
                    li.style.cssText = 'margin: 1rem 0; padding: 1.25rem; background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240, 255, 244, 0.8) 100%); border-radius: 12px; border: 1px solid rgba(34, 197, 94, 0.2); box-shadow: 0 4px 12px rgba(34, 197, 94, 0.1); transition: all 0.3s ease; position: relative; overflow: hidden;';
                    
                    // Add hover effect
                    li.addEventListener('mouseenter', () => {
                        li.style.transform = 'translateY(-2px)';
                        li.style.boxShadow = '0 8px 24px rgba(34, 197, 94, 0.15)';
                    });
                    li.addEventListener('mouseleave', () => {
                        li.style.transform = 'translateY(0)';
                        li.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.1)';
                    });

                    let linkHtml;
                    if (detail.links) {
                        linkHtml = `
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">
                                <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.15) 100%); padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.2); position: relative; transition: all 0.2s ease;" onmouseover="this.style.background='linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.2) 100%)" onmouseout="this.style.background='linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.15) 100%)'">
                                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: linear-gradient(180deg, var(--primary-green) 0%, rgba(34, 197, 94, 0.6) 100%); border-radius: 0 2px 2px 0;"></div>
                                    <span style="font-size: 0.8rem; color: var(--primary-green); font-weight: 800; display: block; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.5px;">📈 CHAPTER 1A</span>
                                    <a href="${detail.links[0]}" target="_blank" style="color: var(--primary-green); text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: all 0.2s ease;" onmouseover="this.style.color='#059669'; this.style.textDecoration='underline'" onmouseout="this.style.color='var(--primary-green)'; this.style.textDecoration='none'">Laws of exponents (pp. 4–10)</a>
                                </div>
                                <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.15) 100%); padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(34, 197, 94, 0.2); position: relative; transition: all 0.2s ease;" onmouseover="this.style.background='linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.2) 100%)" onmouseout="this.style.background='linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.15) 100%)'">
                                    <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: linear-gradient(180deg, var(--primary-green) 0%, rgba(34, 197, 94, 0.6) 100%); border-radius: 0 2px 2px 0;"></div>
                                    <span style="font-size: 0.8rem; color: var(--primary-green); font-weight: 800; display: block; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.5px;">📈 CHAPTER 1C</span>
                                    <a href="${detail.links[1]}" target="_blank" style="color: var(--primary-green); text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: all 0.2s ease;" onmouseover="this.style.color='#059669'; this.style.textDecoration='underline'" onmouseout="this.style.color='var(--primary-green)'; this.style.textDecoration='none'">Logarithms (pp. 14–21)</a>
                                </div>
                            </div>
                        `;
                    } else {
                        linkHtml = `<a href="${detail.link}" target="_blank" style="color: var(--primary-green); text-decoration: none; font-weight: 600; border-bottom: 1px dotted var(--primary-green); transition: all 0.2s ease;" onmouseover="this.style.color='#059669'; this.style.borderBottomStyle='solid'" onmouseout="this.style.color='var(--primary-green)'; this.style.borderBottomStyle='dotted'">${detail.book}</a>`;
                    }
                    li.innerHTML = `
                        <div style="margin-bottom: 0.75rem; position: relative;">
                            <div style="position: absolute; top: -0.5rem; right: -0.5rem; width: 24px; height: 24px; background: linear-gradient(135deg, var(--primary-green) 0%, #059669 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: white; font-weight: bold;">${code.replace('SL', '')}</div>
                            <strong style="color: var(--primary-red); font-size: 1rem; font-weight: 700;">${code}:</strong> 
                            <span style="color: var(--text-main); font-weight: 600; font-size: 1rem; line-height: 1.4;">${detail.name}</span>
                        </div>
                        <div style="font-size: 0.9rem; color: var(--text-secondary);">
                            <span style="display: inline-flex; align-items: center; margin-bottom: 0.5rem; font-weight: 600; color: var(--primary-green);">
                                📖 Hodder SL Textbook
                            </span>
                            ${linkHtml}
                        </div>
                    `;
                    slList.appendChild(li);
                }
            });
            slSection.appendChild(slList);
            columnsContainer.appendChild(slSection);
        }

        if (hlCodes.length > 0) {
            const hlSection = document.createElement('div');
            hlSection.style.cssText = 'background: linear-gradient(135deg, #f8f9ff 0%, #fff5f5 100%); border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem;';
            hlSection.innerHTML = '<h4 style="margin: 0 0 0.75rem 0; color: var(--primary-blue); font-size: 1.1rem; font-weight: 700; border-bottom: 2px solid var(--primary-blue); padding-bottom: 0.5rem;">📚 HL Selection Topics</h4>';
            const hlList = document.createElement('ul');
            hlList.style.cssText = 'margin: 0; padding: 0; list-style: none;';
            
            hlCodes.forEach(code => {
                const detail = topicDetails[code];
                if (detail) {
                    const li = document.createElement('li');
                    li.style.cssText = 'margin: 1rem 0; padding: 1.25rem; background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248, 249, 255, 0.8) 100%); border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.2); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1); transition: all 0.3s ease; position: relative; overflow: hidden;';
                    
                    // Add hover effect
                    li.addEventListener('mouseenter', () => {
                        li.style.transform = 'translateY(-2px)';
                        li.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.15)';
                    });
                    li.addEventListener('mouseleave', () => {
                        li.style.transform = 'translateY(0)';
                        li.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.1)';
                    });
                    
                    const linkHtml = detail.link ? 
                        `<a href="${detail.link}" target="_blank" style="color: var(--primary-blue); text-decoration: none; font-weight: 600; border-bottom: 1px dotted var(--primary-blue); transition: all 0.2s ease;" onmouseover="this.style.color='#1d4ed8'; this.style.borderBottomStyle='solid'" onmouseout="this.style.color='var(--primary-blue)'; this.style.borderBottomStyle='dotted'">${detail.book}</a>` : 
                        detail.book;
                    
                    li.innerHTML = `
                        <div style="margin-bottom: 0.75rem; position: relative;">
                            <div style="position: absolute; top: -0.5rem; right: -0.5rem; width: 24px; height: 24px; background: linear-gradient(135deg, var(--primary-blue) 0%, #1d4ed8 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: white; font-weight: bold;">${code.replace('HL', '')}</div>
                            <strong style="color: var(--primary-red); font-size: 1rem; font-weight: 700;">AHL ${code.replace('HL', '')}:</strong> 
                            <span style="color: var(--text-main); font-weight: 600; font-size: 1rem; line-height: 1.4;">${detail.name}</span>
                        </div>
                        <div style="font-size: 0.9rem; color: var(--text-secondary);">
                            <span style="display: inline-flex; align-items: center; margin-bottom: 0.5rem; font-weight: 600; color: var(--primary-blue);">
                                📖 Hodder HL Textbook
                            </span>
                            ${linkHtml}
                        </div>
                    `;
                    hlList.appendChild(li);
                }
            });
            hlSection.appendChild(hlList);
            columnsContainer.appendChild(hlSection);
        }
        
        // Add the columns container to the fragment
        if (hlCodes.length > 0 || slCodes.length > 0) {
            frag.appendChild(columnsContainer);
        }

        // Add exercises link section (full width below columns)
        const exercisesSection = document.createElement('div');
        exercisesSection.style.cssText = 'background: linear-gradient(135deg, #fff7ed 0%, #fef3c7 100%); border: 1px solid #fed7aa; border-radius: 12px; padding: 1.5rem; margin: 1.5rem 0; text-align: center; position: relative; overflow: hidden; box-shadow: 0 6px 20px rgba(217, 119, 6, 0.15);';
        
        // Add decorative background pattern
        exercisesSection.innerHTML = `
            <div style="position: absolute; top: -10px; left: -10px; width: 40px; height: 40px; background: radial-gradient(circle, rgba(217, 119, 6, 0.1) 0%, transparent 70%); border-radius: 50%;"></div>
            <div style="position: absolute; bottom: -15px; right: -15px; width: 60px; height: 60px; background: radial-gradient(circle, rgba(245, 158, 11, 0.1) 0%, transparent 70%); border-radius: 50%;"></div>
            
            <div style="margin-bottom: 0.75rem; position: relative; z-index: 1;">
                <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(217, 119, 6, 0.1); padding: 0.5rem 1rem; border-radius: 20px; margin-bottom: 0.5rem;">
                    <span style="font-size: 1.2rem;">🎯</span>
                    <span style="font-size: 1.1rem; font-weight: 800; color: #d97706; text-transform: uppercase; letter-spacing: 0.5px;">Assessment Preparation</span>
                </div>
            </div>
            
            <a href="https://nyc.cloud.appwrite.io/v1/storage/buckets/68ae70d900306dd864f3/files/68ae70fc000a9f1bcdc2/view?project=68ae66cf002308df352a&mode=admin" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 1rem 2rem; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 1.1rem; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(217, 119, 6, 0.3); position: relative; z-index: 1; border: 2px solid transparent;" onmouseover="this.style.transform='translateY(-3px) scale(1.02)'; this.style.boxShadow='0 8px 25px rgba(217, 119, 6, 0.4)'; this.style.borderColor='rgba(255,255,255,0.3)'" onmouseout="this.style.transform='translateY(0) scale(1)'; this.style.boxShadow='0 4px 15px rgba(217, 119, 6, 0.3)'; this.style.borderColor='transparent'">
                <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.2rem;">📝</span>
                    <span>EXERCISES FOR THE CHECKPOINT 1</span>
                </span>
            </a>
            
            <div style="margin-top: 1rem; font-size: 0.95rem; color: #92400e; font-style: italic; position: relative; z-index: 1;">
                <span style="display: inline-flex; align-items: center; gap: 0.25rem;">
                    <span>✨</span>
                    <span>Practice exercises specifically designed for your upcoming assessment</span>
                    <span>✨</span>
                </span>
            </div>
        `;
        frag.appendChild(exercisesSection);

        examScopeEl.innerHTML = '';
        examScopeEl.appendChild(frag);
    }

    (function setupExamBanner(){
        const now = new Date();
        const next = getNextExam(now);
        if (!next) return;
        const days = Math.ceil((next.start - now) / 86400000);
        if (days < 0) return;
        examDaysEl.textContent = String(days);
        examDateEl.textContent = formatDateRange(next.start, next.end);
        examWindowEl.textContent = next.label;
        collectScope(next.start);
        examBanner.style.display = 'block';
    })();
    const applyTemporalClasses = (schedule) => {
        const now = new Date();
        const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - ((now.getDay()+6)%7)); // Monday
        const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate()+6);
        document.querySelectorAll('.code-pill').forEach(pill => {
            const code = pill.dataset.code;
            const d = schedule[code];
            pill.classList.remove('past','current');
            if (!d) return;
            if (d < startOfWeek) pill.classList.add('past');
            else if (d >= startOfWeek && d <= endOfWeek) pill.classList.add('current');
        });
    };
    const autoMarkByDate = () => {
        const schedule = buildScheduleMap();
        const now = new Date();
        Object.entries(schedule).forEach(([code, d]) => {
            if (d < now) state[code] = true;
        });
        saveState(state);
        document.querySelectorAll('.code-pill').forEach(pill => {
            const code = pill.dataset.code;
            const done = !!state[code];
            pill.classList.toggle('completed', done);
            pill.setAttribute('aria-pressed', String(done));
        });
        applyTemporalClasses(schedule);
        updateSummary();
        schedulePush();
    };
    if (autoMark?.checked) {
        autoMarkByDate();
    }
    autoMark?.addEventListener('change', () => { if (autoMark.checked) autoMarkByDate(); });

    // Supabase pull/push
    const spbUrlInput = document.getElementById('spb-url');
    const spbKeyInput = document.getElementById('spb-key');
    const spbPullBtn = document.getElementById('spb-pull');
    const spbPushBtn = document.getElementById('spb-push');
    const spbStatus = document.getElementById('spb-status');
    const deviceId = (() => {
        const k = 'aihl_device_id';
        let v = localStorage.getItem(k);
        if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
        return v;
    })();
    function getSupabaseClient() {
        const url = spbUrlInput?.value?.trim();
        const key = spbKeyInput?.value?.trim();
        if (!url || !key) throw new Error('Missing Supabase URL or anon key');
        // globalThis.supabase from UMD
        return window.supabase.createClient(url, key);
    }
    async function pullFromCloud() {
        try {
            spbStatus.textContent = 'Pulling…';
            const supa = getSupabaseClient();
            const { data, error } = await supa
                .from('aihl_syllabus_progress')
                .select('code, completed')
                .eq('device_id', deviceId);
            if (error) throw error;
            (data || []).forEach(row => { state[canonical(row.code)] = !!row.completed; });
            saveState(state);
            document.querySelectorAll('.code-pill')?.forEach(pill => {
                const code = pill.dataset.code;
                const done = !!state[code];
                pill.classList.toggle('completed', done);
                pill.setAttribute('aria-pressed', String(done));
            });
            updateSummary();
            spbStatus.textContent = 'Pulled ✓';
        } catch (e) {
            spbStatus.textContent = 'Pull failed';
            console.error(e);
            alert('Pull failed: ' + (e?.message || e));
        }
    }
    async function pushToCloud() {
        try {
            spbStatus.textContent = 'Pushing…';
            const supa = getSupabaseClient();
            const rows = Object.keys(state).map(code => ({
                device_id: deviceId,
                code,
                completed: !!state[code],
                completed_at: state[code] ? new Date().toISOString() : null,
            }));
            if (rows.length === 0) { spbStatus.textContent = 'Nothing to push'; return; }
            const { error } = await supa.from('aihl_syllabus_progress').upsert(rows, { onConflict: 'device_id,code' });
            if (error) throw error;
            spbStatus.textContent = 'Pushed ✓';
        } catch (e) {
            spbStatus.textContent = 'Push failed';
            console.error(e);
            alert('Push failed: ' + (e?.message || e));
        }
    }
    spbPullBtn?.addEventListener('click', pullFromCloud);
    spbPushBtn?.addEventListener('click', pushToCloud);

    // Debounced incremental push after user changes
    let __pushTimer = null;
    function schedulePush() {
        if (!spbUrlInput || !spbKeyInput) return;
        clearTimeout(__pushTimer);
        __pushTimer = setTimeout(() => { pushToCloud(); }, 2000);
    }

    // Auto-sync once per browser session: pull → merge (OR) → push
    async function autoSyncOnce() {
        try {
            if (!spbUrlInput || !spbKeyInput) return;
            if (localStorage.getItem('aihl_synced_once_v1')) return;
            spbStatus.textContent = 'Syncing…';
            // Pull
            const supa = getSupabaseClient();
            const { data, error } = await supa
                .from('aihl_syllabus_progress')
                .select('code, completed')
                .eq('device_id', deviceId);
            if (error) throw error;
            // Merge (completed = remote OR local)
            (data || []).forEach(row => {
                const k = canonical(row.code);
                state[k] = !!row.completed || !!state[k];
            });
            saveState(state);
            // Reflect on UI
            document.querySelectorAll('.code-pill').forEach(pill => {
                const done = !!state[pill.dataset.code];
                pill.classList.toggle('completed', done);
                pill.setAttribute('aria-pressed', String(done));
            });
            updateSummary();
            // Push merged
            const rows = Object.keys(state).map(code => ({
                device_id: deviceId,
                code,
                completed: !!state[code],
                completed_at: state[code] ? new Date().toISOString() : null,
            }));
            if (rows.length) {
                const { error: upErr } = await supa
                    .from('aihl_syllabus_progress')
                    .upsert(rows, { onConflict: 'device_id,code' });
                if (upErr) throw upErr;
            }
            localStorage.setItem('aihl_synced_once_v1', '1');
            spbStatus.textContent = 'Synced ✓';
        } catch (e) {
            console.error(e);
            spbStatus.textContent = 'Sync failed';
        }
    }
    autoSyncOnce();
});
