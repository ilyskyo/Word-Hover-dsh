/**
 * 浮层里的纵向溢出菜单（竖三点 → 下拉选项）。
 *
 * 用途：把「不常用但想改」的设置项收进来，避免浮层头部堆满按钮。
 * 目前里面有发音口音选择与几个显示开关，后续加设置项只需往 items 里加一条。
 *
 * 设计要点：
 *  - 菜单与浮层同在一个 Shadow DOM 里，样式天然隔离；
 *  - 用 position: fixed 定位在触发器旁边，超出视口会自动翻转/夹取；
 *  - 支持键盘：Enter/Space 打开、Esc 关闭、上下键移动、右键收起；
 *  - 点外部关闭；选择后保持打开（用户常连续改多项）。
 */

/** 单个菜单项的描述。 */
// {
//   id: string,
//   type: 'group' | 'radio' | 'checkbox',
//   label: string,
//   options?: Array<{ value: string, label: string }>,  // radio 用
//   value?: string | boolean,                            // 当前值
//   disabled?: boolean,
// }

/** 菜单与触发器之间的间距。 */
const MENU_GAP = 4;
/** 菜单与视口边缘的最小距离。 */
const MENU_EDGE = 8;

export class OverflowMenu {
  /**
   * @param {HTMLElement} shadowRoot 浮层所在的 shadow root（菜单挂在这里）
   * @param {Document} doc
   */
  constructor(shadowRoot, doc) {
    this.shadow = shadowRoot;
    this.doc = doc;
    this.el = null;
    this.trigger = null;
    this.onSelect = null;
    this.items = [];
    this.open = false;

    this.handleDocPointerDown = (event) => {
      if (!this.open) return;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (path.includes(this.el) || path.includes(this.trigger)) return;
      this.close();
    };
    this.handleKeydown = (event) => {
      if (!this.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.moveFocus(event.key === 'ArrowDown' ? 1 : -1);
      }
    };
    this.handleReposition = () => {
      if (this.open) this.position();
    };
  }

  /**
   * 刷新菜单配置。触发器点击时会用这里存下的最新配置渲染。
   * 这样调用方可以反复更新选项，而不需要重建菜单实例。
   */
  setItems(items = [], onSelect = null) {
    this.items = Array.isArray(items) ? items : [];
    this.onSelect = onSelect;
  }

  /** 创建触发器按钮（竖三点）。 */
  createTrigger(title = '更多设置') {
    const btn = this.doc.createElement('button');
    btn.type = 'button';
    btn.className = 'dsh-wh-btn dsh-wh-btn-icon';
    btn.textContent = '⋮';
    btn.setAttribute('aria-label', title);
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.open) this.close(true);
      else this.show(btn);
    });
    this.trigger = btn;
    return btn;
  }

  /** 打开菜单（使用 setItems 存下的配置）。 */
  show(trigger) {
    this.close();
    this.trigger = trigger || this.trigger;
    if (!this.trigger || this.items.length === 0) return;

    const doc = this.doc;
    const menu = doc.createElement('div');
    menu.className = 'dsh-wh-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '更多设置');

    for (const item of this.items) {
      if (item.type === 'group') {
        const group = doc.createElement('div');
        group.className = 'dsh-wh-menu-group';
        group.textContent = item.label;
        menu.append(group);
        continue;
      }

      if (item.type === 'radio') {
        for (const option of item.options || []) {
          const row = doc.createElement('button');
          row.type = 'button';
          row.className = 'dsh-wh-menu-item';
          row.setAttribute('role', 'menuitemradio');
          row.setAttribute('aria-checked', String(option.value === item.value));
          row.dataset.value = option.value;
          row.dataset.itemId = item.id;
          const check = doc.createElement('span');
          check.className = 'dsh-wh-menu-check';
          check.textContent = option.value === item.value ? '✓' : '';
          const text = doc.createElement('span');
          text.className = 'dsh-wh-menu-text';
          text.textContent = option.label;
          row.append(check, text);
          row.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.onSelect?.(item.id, option.value);
            this.refreshItem(item.id, option.value);
          });
          menu.append(row);
        }
        continue;
      }

      // checkbox
      const row = doc.createElement('button');
      row.type = 'button';
      row.className = 'dsh-wh-menu-item';
      row.setAttribute('role', 'menuitemcheckbox');
      row.setAttribute('aria-checked', String(Boolean(item.value)));
      row.dataset.value = String(Boolean(item.value));
      row.dataset.itemId = item.id;
      const check = doc.createElement('span');
      check.className = 'dsh-wh-menu-check';
      check.textContent = item.value ? '✓' : '';
      const text = doc.createElement('span');
      text.className = 'dsh-wh-menu-text';
      text.textContent = item.label;
      row.append(check, text);
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = !(row.dataset.value === 'true');
        this.onSelect?.(item.id, next);
        this.refreshItem(item.id, next);
      });
      menu.append(row);
    }

    this.shadow.append(menu);
    this.el = menu;
    this.open = true;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.position();

    this.doc.addEventListener('pointerdown', this.handleDocPointerDown, true);
    this.doc.addEventListener('keydown', this.handleKeydown, true);
    this.doc.defaultView?.addEventListener('scroll', this.handleReposition, true);
    this.doc.defaultView?.addEventListener('resize', this.handleReposition);
  }

  /** 就地更新某一项的选中态，不重建整个菜单（保持焦点）。 */
  refreshItem(itemId, value) {
    if (!this.el) return;
    for (const row of this.el.querySelectorAll('.dsh-wh-menu-item')) {
      if (row.dataset.itemId !== itemId) continue;
      const isRadio = row.getAttribute('role') === 'menuitemradio';
      const checked = isRadio ? row.dataset.value === String(value) : String(Boolean(value)) === 'true';
      row.setAttribute('aria-checked', String(checked));
      row.dataset.value = isRadio ? row.dataset.value : String(Boolean(value));
      const check = row.querySelector('.dsh-wh-menu-check');
      if (check) check.textContent = checked ? '✓' : '';
    }
  }

  /** 定位：优先在触发器下方，空间不足翻上方；水平夹进视口。 */
  position() {
    if (!this.el || !this.trigger) return;
    // defaultView 在非浏览器环境可能为空，退回全局 window，再退回空对象
    const view = this.doc.defaultView || globalThis.window || {};
    const rect = this.trigger.getBoundingClientRect?.();
    const width = this.el.offsetWidth;
    const height = this.el.offsetHeight;
    const vw = view.innerWidth ?? 0;
    const vh = view.innerHeight ?? 0;
    // 量不到视口尺寸（测试桩）时直接定位到触发器下方，不做夹取
    if (!rect || !vw || !vh) {
      if (rect) {
        this.el.style.left = `${Math.round(rect.left)}px`;
        this.el.style.top = `${Math.round(rect.bottom + MENU_GAP)}px`;
      }
      return;
    }

    // 右对齐到触发按钮（三点通常在右上角），再夹进视口
    let left = rect.right - width;
    left = Math.min(Math.max(MENU_EDGE, left), Math.max(MENU_EDGE, vw - width - MENU_EDGE));

    let top = rect.bottom + MENU_GAP;
    if (top + height > vh - MENU_EDGE) {
      const above = rect.top - height - MENU_GAP;
      top = above >= MENU_EDGE ? above : Math.max(MENU_EDGE, vh - height - MENU_EDGE);
    }

    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  /** 键盘上下键在菜单项之间移动焦点。 */
  moveFocus(delta) {
    if (!this.el) return;
    const rows = [...this.el.querySelectorAll('.dsh-wh-menu-item')];
    if (rows.length === 0) return;
    const current = rows.indexOf(this.doc.activeElement);
    const next = current < 0
      ? (delta > 0 ? 0 : rows.length - 1)
      : (current + delta + rows.length) % rows.length;
    rows[next]?.focus?.();
  }

  /**
   * 关闭菜单。
   * @param {boolean} restoreFocus 是否把焦点还给触发按钮（键盘关闭时为 true）
   */
  close(restoreFocus = false) {
    if (!this.open) return;
    this.open = false;
    this.doc.removeEventListener('pointerdown', this.handleDocPointerDown, true);
    this.doc.removeEventListener('keydown', this.handleKeydown, true);
    this.doc.defaultView?.removeEventListener('scroll', this.handleReposition, true);
    this.doc.defaultView?.removeEventListener('resize', this.handleReposition);
    this.el?.remove();
    this.el = null;
    this.trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.trigger?.focus?.();
  }

  get isOpen() {
    return this.open;
  }

  destroy() {
    this.close();
    this.trigger = null;
    this.onSelect = null;
    this.items = [];
  }
}
