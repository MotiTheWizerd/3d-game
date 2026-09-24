class TodoApp {
  constructor() {
    this.tasks = this.loadTasks();
    this.currentFilter = 'all';
    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.render();
  }

  cacheDOM() {
    this.taskInput = document.getElementById('taskInput');
    this.addBtn = document.getElementById('addBtn');
    this.taskList = document.getElementById('taskList');
    this.taskCount = document.getElementById('taskCount');
    this.filterBtns = document.querySelectorAll('.filters__btn');
    this.clearCompletedBtn = document.getElementById('clearCompleted');
    this.progressWrapper = document.getElementById('progressWrapper');
    this.progressFill = document.getElementById('progressFill');
  }

  bindEvents() {
    this.addBtn.addEventListener('click', () => this.addTask());
    this.taskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTask();
    });

    this.filterBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => this.setFilter(e.target.dataset.filter));
    });

    this.clearCompletedBtn.addEventListener('click', () => this.clearCompleted());
  }

  addTask() {
    const text = this.taskInput.value.trim();
    if (!text) return;

    const task = { id: Date.now(), text, completed: false };
    this.tasks.push(task);
    this.taskInput.value = '';
    this.saveTasks();
    this.render();
    this.taskInput.focus();
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.saveTasks();
    this.render();
  }

  toggleTask(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      this.render();
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;
    this.filterBtns.forEach((btn) => {
      btn.classList.toggle('filters__btn--active', btn.dataset.filter === filter);
    });
    this.render();
  }

  getFilteredTasks() {
    switch (this.currentFilter) {
      case 'active': return this.tasks.filter((t) => !t.completed);
      case 'completed': return this.tasks.filter((t) => t.completed);
      default: return this.tasks;
    }
  }

  getCompletionPercent() {
    if (this.tasks.length === 0) return 0;
    return Math.round((this.tasks.filter(t => t.completed).length / this.tasks.length) * 100);
  }

  render() {
    this.updateProgress();
    this.clearCompletedBtn.style.display = this.tasks.some(t => t.completed) ? '' : 'none';

    const filtered = this.getFilteredTasks();

    if (filtered.length === 0) {
      const messages = this.getEmptyStateMessage();
      this.taskList.innerHTML = `
        <li class="empty-state">
          <span class="empty-state__emoji">${messages.emoji}</span>
          <p class="empty-state__text">${messages.text}</p>
          <p class="empty-state__subtext">${messages.subtext}</p>
        </li>`;
    } else {
      this.taskList.innerHTML = '';
      filtered.forEach((task) => {
        const li = this.createTaskElement(task);
        this.taskList.appendChild(li);
      });
    }

    this.updateCount();
  }

  getEmptyStateMessage() {
    const all = [
      { emoji: '🎯', text: 'No tasks yet!', subtext: 'Add your first task above to get started' },
      { emoji: '✅', text: 'All caught up!', subtext: "You've completed everything — nice work!" },
      { emoji: '👀', text: 'Nothing here', subtext: 'Try switching to a different filter' },
    ];
    if (this.currentFilter === 'active') return all[1];
    if (this.currentFilter === 'completed') return all[2];
    return all[0];
  }

  updateProgress() {
    const percent = this.getCompletionPercent();
    if (this.tasks.length > 0) {
      this.progressWrapper.style.display = '';
      this.progressFill.style.width = `${percent}%`;
    } else {
      this.progressWrapper.style.display = 'none';
    }
  }

  updateCount() {
    const active = this.tasks.filter((t) => !t.completed).length;
    const total = this.tasks.length;
    const completed = total - active;
    this.taskCount.innerHTML = `<span>${active}</span> ${active === 1 ? 'task' : 'tasks'} remaining`;

    if (total > 0 && active > 0) {
      this.taskCount.innerHTML += ` · <span>${completed}</span> done`;
    }
  }

  clearCompleted() {
    const completedCount = this.tasks.filter(t => t.completed).length;
    if (completedCount === 0) return;
    this.tasks = this.tasks.filter((t) => !t.completed);
    this.saveTasks();
    this.render();
  }

  saveTasks() { localStorage.setItem('tasks', JSON.stringify(this.tasks)); }

  loadTasks() {
    const stored = localStorage.getItem('tasks');
    return stored ? JSON.parse(stored) : [];
  }

  escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  createTaskElement(task) {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' completed' : ''}`;
    li.dataset.id = task.id;

    li.innerHTML = `
      <input type="checkbox" class="task-item__checkbox" ${task.completed ? 'checked' : ''} aria-label="Toggle task completion">
      <span class="task-item__text">${this.escapeHtml(task.text)}</span>
      <button class="task-item__delete" aria-label="Delete task">&times;</button>`;

    const checkbox = li.querySelector('.task-item__checkbox');
    const deleteBtn = li.querySelector('.task-item__delete');

    checkbox.addEventListener('change', () => this.toggleTask(task.id));
    deleteBtn.addEventListener('click', () => this.deleteTask(task.id));

    return li;
  }
}

document.addEventListener('DOMContentLoaded', () => { new TodoApp(); });
