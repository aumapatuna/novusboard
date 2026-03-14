// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAaaNlsh8KDvY5o2sh7SU6nRCCRiSIAcGc",
    authDomain: "novusboard.firebaseapp.com",
    projectId: "novusboard",
    storageBucket: "novusboard.firebasestorage.app",
    messagingSenderId: "377879477960",
    appId: "1:377879477960:web:0533231d26095c31836ffd"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// State management
let currentUser = null; // Currently logged in user's email
let tasks = [];
let currentFilter = 'all';
let copiedTasks = []; // Array to hold tasks copied from a specific date
let editingTaskId = null; // ID of the task currently being edited

// Pagination state
let currentPage = 1;
const daysPerPage = 5;

// DOM Elements
const taskForm = document.getElementById('taskForm');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const filterBtns = document.querySelectorAll('.filter-btn');

// Stats Elements
const totalTasksEl = document.getElementById('totalTasks');
const statTodoEl = document.getElementById('stat-todo');
const statInprogressEl = document.getElementById('stat-inprogress');
const statResolvedEl = document.getElementById('stat-resolved');
const statNotdoneEl = document.getElementById('stat-notdone');
const statClosedEl = document.getElementById('stat-closed');
const statOnholdEl = document.getElementById('stat-onhold');
const statHolidayEl = document.getElementById('stat-holiday');

// Report Modal Elements
const reportModal = document.getElementById('reportModal');
const openReportModalBtn = document.getElementById('openReportModalBtn');
const closeReportModalBtn = document.getElementById('closeReportModalBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const reportTimeframeSelect = document.getElementById('reportTimeframe');
const printableReportCanvas = document.getElementById('printableReport');

// Auth Elements
const authOverlay = document.getElementById('authOverlay');
const mainDashboard = document.getElementById('mainDashboard');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authToggleBtn = document.getElementById('authToggleBtn');
const authToggleText = document.getElementById('authToggleText');
const authSubtitle = document.getElementById('authSubtitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const logoutBtn = document.getElementById('logoutBtn');
const currentUserEmailEl = document.getElementById('currentUserEmail');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const togglePasswordIcon = document.getElementById('togglePasswordIcon');
const authPasswordGroup = document.getElementById('authPasswordGroup');
const authPasswordLabel = document.getElementById('authPasswordLabel');
const authForgotPasswordBtn = document.getElementById('authForgotPasswordBtn');

let authMode = 'login'; // 'login', 'signup', 'forgot'

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Set today's date as default in form
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('taskDate').value = today;

    // Initialize Authentication
    initAuth();

    // Add event listeners
    taskForm.addEventListener('submit', addTask);
    document.getElementById('editTaskForm').addEventListener('submit', confirmEdit);

    // Report listeners
    openReportModalBtn.addEventListener('click', () => {
        reportModal.classList.add('visible');
    });

    closeReportModalBtn.addEventListener('click', () => {
        reportModal.classList.remove('visible');
    });

    downloadPdfBtn.addEventListener('click', generateAndDownloadPDF);

    // Search listener
    document.getElementById('searchInput').addEventListener('input', (e) => {
        currentPage = 1; // Reset to page 1 on search
        renderTasks();
    });

    // CSV listeners
    document.getElementById('exportCsvBtn').addEventListener('click', exportTasksToCSV);
    document.getElementById('importCsvBtn').addEventListener('click', () => document.getElementById('csvFileInput').click());
    document.getElementById('csvFileInput').addEventListener('change', importTasksFromCSV);

    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Set filter and re-render
            currentFilter = e.target.dataset.filter;
            currentPage = 1; // Reset to page 1 on filter
            renderTasks();
        });
    });
});

// Load tasks from Firestore
async function loadTasks() {
    if (!currentUser) return;
    try {
        const doc = await db.collection("users").doc(currentUser).get();
        if (doc.exists && doc.data().tasks) {
            tasks = doc.data().tasks;
        } else {
            tasks = [];
        }
    } catch (err) {
        console.error("Error loading tasks:", err);
        tasks = [];
    }
    renderTasks();
}

// Save tasks to Firestore
async function saveTasks() {
    if (!currentUser) return;
    try {
        await db.collection("users").doc(currentUser).set({
            tasks: tasks
        }, { merge: true });
    } catch (err) {
        console.error("Error saving tasks:", err);
    }
    updateStats();
}

// Add new task
function addTask(e) {
    e.preventDefault();

    const dateInput = document.getElementById('taskDate').value;
    const nameInput = document.getElementById('taskName').value;
    const statusInput = document.getElementById('taskStatus').value;
    const commentInput = document.getElementById('taskComment').value;

    const newTask = {
        id: Date.now().toString(),
        date: dateInput,
        name: nameInput,
        status: statusInput,
        comment: commentInput
    };

    tasks.unshift(newTask); // Add to beginning
    saveTasks();
    renderTasks();

    // Reset form but keep date
    const dateVal = document.getElementById('taskDate').value;
    taskForm.reset();
    document.getElementById('taskDate').value = dateVal;

    // Refresh icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Delete task
function deleteTask(id) {
    tasks = tasks.filter(task => task.id !== id);
    saveTasks();
    renderTasks();
}

// Update task status
function updateTaskStatus(id, newStatus) {
    const taskIndex = tasks.findIndex(task => task.id === id);
    if (taskIndex !== -1) {
        tasks[taskIndex].status = newStatus;
        saveTasks();
        renderTasks();
    }
}

// Format date nicely
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Get CSS class based on status
function getStatusClass(status) {
    switch (status) {
        case 'To Do': return 'status-todo';
        case 'Inprogress': return 'status-inprogress';
        case 'Resolved': return 'status-resolved';
        case 'Not Done': return 'status-notdone';
        case 'Closed': return 'status-closed';
        case 'On Hold': return 'status-onhold';
        case 'Holiday': return 'status-holiday';
        default: return 'status-todo';
    }
}

// Format month and year nicely
function formatMonthYear(dateString) {
    const options = { year: 'numeric', month: 'long' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Utility: Escape HTML to prevent XSS
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Utility: Linkify URLs in text
function linkifyText(text) {
    if (!text) return '';
    const safeText = escapeHTML(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return safeText.replace(urlRegex, function (url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-color); text-decoration: underline;">${url}</a>`;
    });
}

// Render tasks to DOM
function renderTasks() {
    taskList.innerHTML = '';

    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Filter tasks by status filter AND Search term
    let filteredTasks = tasks.filter(task => {
        // Status filter
        const matchesStatus = currentFilter === 'all' || task.status === currentFilter;
        if (!matchesStatus) return false;

        // Search term filter
        if (!searchTerm) return true;

        // Check if any field contains the search term
        const formattedDate = formatDate(task.date).toLowerCase();
        const dateRaw = task.date.toLowerCase();
        const taskName = (task.name || '').toLowerCase();
        const taskStatus = (task.status || '').toLowerCase();
        const taskComment = (task.comment || '').toLowerCase();

        return taskName.includes(searchTerm) ||
            taskComment.includes(searchTerm) ||
            taskStatus.includes(searchTerm) ||
            formattedDate.includes(searchTerm) ||
            dateRaw.includes(searchTerm);
    });

    // Sort tasks by date (newest first)
    filteredTasks.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Show/hide empty state
    if (filteredTasks.length === 0) {
        emptyState.classList.add('visible');
        renderPagination(0);

        // Still update global stats
        updateStats();
        return;
    }

    emptyState.classList.remove('visible');

    // Pagination: Calculate unique dates to group by
    const uniqueDates = [...new Set(filteredTasks.map(t => new Date(t.date).toISOString().split('T')[0]))];
    const totalPages = Math.ceil(uniqueDates.length / daysPerPage);

    // Clamp current page if items were deleted
    if (currentPage > totalPages) currentPage = totalPages || 1;

    // Determine which dates to show for the current page
    const startIndex = (currentPage - 1) * daysPerPage;
    const endIndex = startIndex + daysPerPage;
    const paginatedDates = uniqueDates.slice(startIndex, endIndex);

    let currentDateGroup = '';

    filteredTasks.forEach(task => {
        // Grouping logic
        const taskDateGrp = new Date(task.date).toISOString().split('T')[0];

        // Skip rendering if this task's date is not on the current page
        if (!paginatedDates.includes(taskDateGrp)) return;

        if (taskDateGrp !== currentDateGroup) {
            // Add group header
            currentDateGroup = taskDateGrp;

            // Check if any task in this date group is a Holiday
            const hasHoliday = filteredTasks.some(t => t.date.startsWith(taskDateGrp) && t.status === 'Holiday');

            const groupTr = document.createElement('tr');
            groupTr.className = 'date-group-header' + (hasHoliday ? ' holiday-header' : '');

            // Header contains the date, plus the copy button aligned right.
            groupTr.innerHTML = `
                <td colspan="4">
                    <i data-lucide="calendar" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>
                    ${formatMonthYear(task.date)} - ${formatDate(task.date)}
                </td>
                <td class="group-actions">
                    <button class="action-btn" onclick="copyTasksByDate('${taskDateGrp}')" title="Copy tasks for this date">
                        <i data-lucide="copy"></i>
                    </button>
                    ${copiedTasks.length > 0 ? `<button class="action-btn" onclick="openPasteModal()" title="Paste copied tasks">
                        <i data-lucide="clipboard-paste"></i>
                    </button>` : ''}
                </td>
            `;
            taskList.appendChild(groupTr);
        }

        const tr = document.createElement('tr');

        // Format status badge and select
        const statusClass = getStatusClass(task.status);
        const isHoliday = task.status === 'Holiday';

        // Set the dropdown menu options. If it's a Holiday, only show Holiday and disable turning it into something else easily (to prevent accidents)
        const statusSelectOptions = isHoliday
            ? `<option value="Holiday" selected>Holiday</option>`
            : `
                <option value="To Do" ${task.status === 'To Do' ? 'selected' : ''}>To Do</option>
                <option value="Inprogress" ${task.status === 'Inprogress' ? 'selected' : ''}>Inprogress</option>
                <option value="Resolved" ${task.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                <option value="Not Done" ${task.status === 'Not Done' ? 'selected' : ''}>Not Done</option>
                <option value="Closed" ${task.status === 'Closed' ? 'selected' : ''}>Closed</option>
                <option value="On Hold" ${task.status === 'On Hold' ? 'selected' : ''}>On Hold</option>
            `;

        tr.innerHTML = `
            <td class="col-date">${formatDate(task.date)}</td>
            <td class="col-task" ${isHoliday ? 'style="font-weight: 600; color: var(--status-holiday);"' : ''}>${linkifyText(task.name)}</td>
            <td>
                <select class="status-update ${statusClass}" onchange="updateTaskStatus('${task.id}', this.value)" ${isHoliday ? 'disabled title="Holiday status cannot be changed"' : ''}>
                    ${statusSelectOptions}
                </select>
            </td>
            <td class="col-comment" title="${escapeHTML(task.comment)}">${linkifyText(task.comment) || '-'}</td>
            <td class="actions-cell">
                <button class="action-btn edit" onclick="openEditModal('${task.id}')" title="Edit Task">
                    <i data-lucide="edit"></i>
                </button>
                <button class="action-btn delete" onclick="deleteTask('${task.id}')" title="Delete Task">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        `;

        taskList.appendChild(tr);
    });

    // Render pagination controls
    renderPagination(totalPages);

    // Initialize icons for new elements
    if (window.lucide) {
        lucide.createIcons();
    }

    updateStats();
}

function renderPagination(totalPages) {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;

    paginationContainer.innerHTML = '';

    // Only show pagination if there is more than 1 page
    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => {
            currentPage = i;
            renderTasks();

            // Scroll back up to the table
            document.querySelector('.table-section').scrollIntoView({ behavior: 'smooth' });
        };
        paginationContainer.appendChild(btn);
    }
}

// Copy/Paste Logic
function copyTasksByDate(dateString) {
    // Collect all tasks exactly matching this date (ignoring time)
    copiedTasks = tasks.filter(task => {
        return new Date(task.date).toISOString().split('T')[0] === dateString;
    });

    // Briefly show an indication that it was copied, and update table buttons
    alert(`Copied ${copiedTasks.length} task(s) from ${formatDate(dateString)}.`);
    renderTasks(); // Re-render to show paste buttons
}

function openPasteModal() {
    if (copiedTasks.length === 0) return;
    document.getElementById('pasteModal').classList.add('visible');

    // Set default paste date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pasteDate').value = today;
}

function closePasteModal() {
    document.getElementById('pasteModal').classList.remove('visible');
}

function confirmPaste() {
    const targetDate = document.getElementById('pasteDate').value;
    if (!targetDate) return;

    // Create new identical tasks with the target date
    const newTasks = copiedTasks.map((t, index) => {
        return {
            id: Date.now().toString() + index, // Ensure unique IDs
            date: targetDate,
            name: t.name,
            status: 'To Do', // Reset status when pasted to a new line
            comment: t.comment
        }
    });

    tasks = [...newTasks, ...tasks];
    saveTasks();

    closePasteModal();
    renderTasks();
    alert(`Pasted ${newTasks.length} task(s) to ${formatDate(targetDate)}.`);
}

// Edit Task Logic
function openEditModal(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    editingTaskId = id;

    document.getElementById('editTaskDate').value = task.date;
    document.getElementById('editTaskName').value = task.name;
    document.getElementById('editTaskStatus').value = task.status;
    document.getElementById('editTaskComment').value = task.comment || '';

    // If it's a holiday, ensure the status dropdown is locked so it can't be changed here either
    if (task.status === 'Holiday') {
        document.getElementById('editTaskStatus').disabled = true;
    } else {
        document.getElementById('editTaskStatus').disabled = false;
    }

    // Show modal
    document.getElementById('editModal').classList.add('visible');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('visible');

    // Re-enable the select dropdown if it was disabled for a holiday
    document.getElementById('editTaskStatus').disabled = false;

    editingTaskId = null;
}

function confirmEdit(e) {
    e.preventDefault();
    if (!editingTaskId) return;

    const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
    if (taskIndex !== -1) {
        tasks[taskIndex].date = document.getElementById('editTaskDate').value;
        tasks[taskIndex].name = document.getElementById('editTaskName').value;
        tasks[taskIndex].status = document.getElementById('editTaskStatus').value;
        tasks[taskIndex].comment = document.getElementById('editTaskComment').value;

        saveTasks();
        renderTasks();
    }
    closeEditModal();
}

// Update statistics
function updateStats() {
    totalTasksEl.textContent = tasks.length;

    // Calculate individual stats
    let counts = {
        'To Do': 0,
        'Inprogress': 0,
        'Resolved': 0,
        'Not Done': 0,
        'Closed': 0,
        'On Hold': 0,
        'Holiday': 0
    };

    tasks.forEach(t => {
        if (counts[t.status] !== undefined) {
            counts[t.status]++;
        }
    });

    // Update elements
    if (statTodoEl) statTodoEl.textContent = counts['To Do'];
    if (statInprogressEl) statInprogressEl.textContent = counts['Inprogress'];
    if (statResolvedEl) statResolvedEl.textContent = counts['Resolved'];
    if (statNotdoneEl) statNotdoneEl.textContent = counts['Not Done'];
    if (statClosedEl) statClosedEl.textContent = counts['Closed'];
    if (statOnholdEl) statOnholdEl.textContent = counts['On Hold'];
    if (statHolidayEl) statHolidayEl.textContent = counts['Holiday'];
}

// ------ PDF REPORT GENERATION LOGIC ------

function getReportTitle(timeframe) {
    switch (timeframe) {
        case 'daily': return 'Daily Task Report';
        case 'weekly': return 'Weekly Task Report';
        case 'monthly': return 'Monthly Task Report';
        case 'yearly': return 'Yearly Task Report';
        default: return 'Task Report';
    }
}

function filterTasksByTimeframe(timeframe) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tasks.filter(task => {
        const taskDate = new Date(task.date);
        taskDate.setHours(0, 0, 0, 0);

        switch (timeframe) {
            case 'daily':
                return taskDate.getTime() === today.getTime();
            case 'weekly':
                const oneWeekAgo = new Date(today);
                oneWeekAgo.setDate(today.getDate() - 7);
                return taskDate >= oneWeekAgo && taskDate <= today;
            case 'monthly':
                const oneMonthAgo = new Date(today);
                oneMonthAgo.setDate(today.getDate() - 30);
                return taskDate >= oneMonthAgo && taskDate <= today;
            case 'yearly':
                return taskDate.getFullYear() === today.getFullYear();
            default:
                return true;
        }
    });
}

function generateReportHTML(filteredTasks, timeframe) {
    if (filteredTasks.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: #666; font-family: sans-serif;">
                <h1 style="color: #333; margin-bottom: 10px;">${getReportTitle(timeframe)}</h1>
                <p>No tasks found for this time period.</p>
            </div>
        `;
    }

    // Calculate aggregated stats for the period
    const total = filteredTasks.length;
    let completed = 0;

    // Sort tasks chronically
    filteredTasks.sort((a, b) => new Date(a.date) - new Date(b.date));

    let tableRowsHTML = '';
    filteredTasks.forEach(task => {
        if (task.status === 'Resolved' || task.status === 'Closed') {
            completed++;
        }

        tableRowsHTML += `
            <div style="display: flex; border-bottom: 1px solid #eee; padding: 12px 0;">
                <div style="flex: 0 0 15%; padding-right: 10px; font-size: 11px; color: #444; word-break: break-word;">${formatDate(task.date)}</div>
                <div style="flex: 0 0 40%; padding-right: 10px; font-weight: bold; font-size: 12px; color: #111; word-break: break-word;">${linkifyText(task.name)}</div>
                <div style="flex: 0 0 15%; padding-right: 10px; font-size: 11px;">
                    <span style="font-weight: 600; padding: 4px 6px; border-radius: 4px; border: 1px solid #ccc; display: inline-block; white-space: nowrap; font-size: 10px;">${task.status}</span>
                </div>
                <div style="flex: 0 0 30%; font-size: 12px; color: #555; word-break: break-word;">${linkifyText(task.comment) || '-'}</div>
            </div>
        `;
    });

    const completionRate = Math.round((completed / total) * 100) || 0;

    return `
        <div style="width: 800px; padding: 40px; box-sizing: border-box; background: white; color: #222; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
            <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 30px;">
                <h1 style="margin: 0; color: #0f172a; font-size: 28px;">${getReportTitle(timeframe)}</h1>
                <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;">Generated on: ${new Date().toLocaleDateString()}</p>
            </div>
            
            <div style="display: flex; gap: 20px; margin-bottom: 30px;">
                <div style="flex: 1; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #3b82f6;">${total}</div>
                    <div style="font-size: 12px; text-transform: uppercase; color: #64748b; margin-top: 5px; letter-spacing: 1px;">Total Tasks</div>
                </div>
                <div style="flex: 1; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #10b981;">${completed}</div>
                    <div style="font-size: 12px; text-transform: uppercase; color: #64748b; margin-top: 5px; letter-spacing: 1px;">Completed</div>
                </div>
                <div style="flex: 1; background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #8b5cf6;">${completionRate}%</div>
                    <div style="font-size: 12px; text-transform: uppercase; color: #64748b; margin-top: 5px; letter-spacing: 1px;">Completion Rate</div>
                </div>
            </div>

            <div style="margin-top: 20px;">
                <div style="display: flex; background-color: #f1f5f9; padding: 12px 0; border-bottom: 2px solid #cbd5e1;">
                    <div style="flex: 0 0 15%; padding-left: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569;">Date</div>
                    <div style="flex: 0 0 40%; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569;">Task Description</div>
                    <div style="flex: 0 0 15%; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569;">Status</div>
                    <div style="flex: 0 0 30%; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #475569;">Comments</div>
                </div>
                <div style="padding: 0 12px;">
                    ${tableRowsHTML}
                </div>
            </div>
            
            <div style="margin-top: 50px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                End of Report
            </div>
        </div>
    `;
}

async function generateAndDownloadPDF() {
    const timeframe = reportTimeframeSelect.value;
    const filteredTasks = filterTasksByTimeframe(timeframe);

    const stringElement = generateReportHTML(filteredTasks, timeframe);

    // Configure PDF options
    const opt = {
        margin: [0.4, 0.4, 0.4, 0.4],
        filename: `NovusBoard_${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)}_Report_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    // Update button state to show working
    const originalBtnHTML = downloadPdfBtn.innerHTML;
    downloadPdfBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Generating PDF...';
    downloadPdfBtn.disabled = true;
    lucide.createIcons();

    try {
        await html2pdf().set(opt).from(stringElement).save();
    } catch (err) {
        console.error("PDF Generation failed", err);
        alert("Failed to generate PDF. See console for details.");
    } finally {
        // Hide the canvas and reset button
        downloadPdfBtn.innerHTML = originalBtnHTML;
        downloadPdfBtn.disabled = false;
        lucide.createIcons();
        reportModal.classList.remove('visible'); // Close modal automatically upon success
    }
}


// Expose functions to window for inline onclick handlers
window.deleteTask = deleteTask;
window.updateTaskStatus = updateTaskStatus;
window.copyTasksByDate = copyTasksByDate;
window.openPasteModal = openPasteModal;
window.closePasteModal = closePasteModal;
window.confirmPaste = confirmPaste;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;

// ==========================================
// CSV Export & Import Logic
// ==========================================

// Export tasks to CSV
function exportTasksToCSV() {
    if (tasks.length === 0) {
        alert("No tasks to export.");
        return;
    }

    // Create the headers
    const headers = ['id', 'name', 'date', 'status', 'comment'];
    const csvRows = [];
    csvRows.push(headers.join(',')); // Add headers

    // Map tasks to CSV rows
    for (const task of tasks) {
        const values = headers.map(header => {
            let val = task[header] || '';
            val = val.toString().replace(/"/g, '""'); // Escape inner quotes
            if (val.search(/("|,|\n)/g) >= 0) {
                val = `"${val}"`; // Wrap in quotes if needed
            }
            return val;
        });
        csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `NovusBoard_Tasks_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Import tasks from CSV
function importTasksFromCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        try {
            const importedTasks = parseCSV(text);
            if (importedTasks.length > 0) {
                let addedCount = 0;
                let updatedCount = 0;

                importedTasks.forEach(importTask => {
                    const existingIndex = tasks.findIndex(t => t.id === importTask.id);
                    if (existingIndex >= 0) {
                        tasks[existingIndex] = importTask; // Update existing record
                        updatedCount++;
                    } else {
                        tasks.push(importTask); // Add entirely new task
                        addedCount++;
                    }
                });

                saveTasks();
                renderTasks();
                alert(`Successfully imported CSV Data: ${addedCount} Tasks added, ${updatedCount} Tasks updated.`);
            } else {
                alert("No valid tasks found in the CSV. Ensure the columns match the export format (id, name, date, status, comment).");
            }
        } catch (err) {
            console.error(err);
            alert("Error parsing CSV file. Please ensure it is a valid CSV and formatted correctly.");
        }

        // Reset file input so the same file can be selected again
        document.getElementById('csvFileInput').value = '';
    };
    reader.readAsText(file);
}

// Basic CSV Parser utility
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return [];

    // Normalize headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const parsedTasks = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const values = [];
        let inQuotes = false;
        let currentValue = '';

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                if (inQuotes && line[j + 1] === '"') {
                    currentValue += '"'; // unescape quote
                    j++; // skip next quote
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                values.push(currentValue);
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue); // push last value

        const task = {};
        let isValid = false;

        headers.forEach((header, index) => {
            const val = values[index] ? values[index].trim() : '';
            if (header === 'id' || header === 'name' || header === 'date' || header === 'status' || header === 'comment') {
                task[header] = val;
                if (header === 'name' && val) isValid = true; // Minimum requirement: task needs a name
            }
        });

        if (isValid) {
            // Apply logical defaults for missing fields
            if (!task.id) task.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            if (!task.date) task.date = new Date().toISOString().split('T')[0];
            if (!task.status) task.status = 'To Do';
            if (!task.comment) task.comment = '';
            parsedTasks.push(task);
        }
    }

    return parsedTasks;
}

// ==========================================
// Authentication Logic
// ==========================================

// Toggle Password Visibility
togglePasswordBtn.addEventListener('click', () => {
    const type = authPassword.getAttribute('type') === 'password' ? 'text' : 'password';
    authPassword.setAttribute('type', type);

    // Toggle the icon
    if (type === 'password') {
        togglePasswordIcon.setAttribute('data-lucide', 'eye');
    } else {
        togglePasswordIcon.setAttribute('data-lucide', 'eye-off');
    }

    // Refresh the specific icon
    if (window.lucide) {
        lucide.createIcons();
    }
});

function updateAuthUI() {
    authError.style.display = 'none';

    if (authMode === 'login') {
        authSubtitle.textContent = 'Sign in to manage your tasks';
        authToggleText.textContent = "Don't have an account?";
        authToggleBtn.textContent = 'Sign Up';
        authSubmitBtn.textContent = 'Sign In';
        authPasswordLabel.textContent = 'Password';
        authForgotPasswordBtn.style.display = 'inline-block';
        authPassword.placeholder = '••••••••';
    } else if (authMode === 'signup') {
        authSubtitle.textContent = 'Create a new account';
        authToggleText.textContent = 'Already have an account?';
        authToggleBtn.textContent = 'Log In';
        authSubmitBtn.textContent = 'Sign Up';
        authPasswordLabel.textContent = 'Password';
        authForgotPasswordBtn.style.display = 'none';
        authPassword.placeholder = '••••••••';
    } else if (authMode === 'forgot') {
        authSubtitle.textContent = 'Reset your password';
        authToggleText.textContent = 'Remembered your password?';
        authToggleBtn.textContent = 'Log In';
        authSubmitBtn.textContent = 'Reset Password';
        authPasswordLabel.textContent = 'New Password';
        authForgotPasswordBtn.style.display = 'none';
        authPassword.placeholder = 'Enter new password';
    }
}

if (authForgotPasswordBtn) {
    authForgotPasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        authMode = 'forgot';
        updateAuthUI();
    });
}

authToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (authMode === 'login') {
        authMode = 'signup';
    } else {
        authMode = 'login';
    }
    updateAuthUI();
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim().toLowerCase();
    const password = authPassword.value;

    if (!email) {
        showAuthError('Please enter an email.');
        return;
    }

    try {
        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = 'Please wait...';

        if (authMode === 'login') {
            await auth.signInWithEmailAndPassword(email, password);
            authEmail.value = '';
            authPassword.value = '';
            authError.style.display = 'none';
        } else if (authMode === 'signup') {
            await auth.createUserWithEmailAndPassword(email, password);
            authEmail.value = '';
            authPassword.value = '';
            authError.style.display = 'none';
        } else if (authMode === 'forgot') {
            await auth.sendPasswordResetEmail(email);
            authMode = 'login';
            updateAuthUI();
            authPassword.value = '';
            showAuthError(''); // Clear error
            alert('Password reset link sent to your email!');
        }
    } catch (error) {
        let errorMessage = "An error occurred.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMessage = "Invalid email or password.";
        } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = "An account with this email already exists.";
        } else if (error.code === 'auth/weak-password') {
            errorMessage = "Password should be at least 6 characters.";
        } else {
            errorMessage = error.message;
        }
        showAuthError(errorMessage);
    } finally {
        authSubmitBtn.disabled = false;
        updateAuthUI();
    }
});

logoutBtn.addEventListener('click', async () => {
    await auth.signOut();
});

function showAuthError(message) {
    authError.textContent = message;
    authError.style.display = 'block';
}

// Firebase Auth State Listener
function initAuth() {
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is logged in
            currentUser = user.email;
            if (authOverlay) authOverlay.style.display = 'none';
            if (mainDashboard) mainDashboard.style.display = 'flex';
            if (currentUserEmailEl) currentUserEmailEl.textContent = currentUser;
            loadTasks(); // Load tasks from firestore specific to this user

            // Refresh icons if new content appeared
            if (window.lucide) {
                lucide.createIcons();
            }
        } else {
            // Not logged in
            currentUser = null;
            tasks = [];
            renderTasks();
            if (authOverlay) authOverlay.style.display = 'flex';
            if (mainDashboard) mainDashboard.style.display = 'none';
            if (authPassword) authPassword.value = '';
            authMode = 'login';
            updateAuthUI();
        }
    });
}
