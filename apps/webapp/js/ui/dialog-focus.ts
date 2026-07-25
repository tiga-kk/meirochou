/**
 * Helper to manage focus trapping, Escape handling, and background inert state
 * for accessible modal dialogs.
 */
export class DialogFocusController {
  private opener: HTMLElement | null = null;
  private targetDialog: HTMLElement;
  private backgroundTargets: HTMLElement[] = [];
  private backgroundInertState = new Map<HTMLElement, boolean>();
  private onEscapeCallback: (() => void) | null = null;
  private readonly backgroundSelector: string | null;

  constructor(
    dialog: HTMLElement,
    options: {
      onEscape?: () => void;
      backgroundSelector?: string;
    } = {},
  ) {
    this.targetDialog = dialog;
    this.onEscapeCallback = options.onEscape || null;
    this.backgroundSelector = options.backgroundSelector || null;

    if (this.backgroundSelector) {
      this.backgroundTargets = Array.from(
        document.querySelectorAll<HTMLElement>(this.backgroundSelector),
      );
    }
  }

  private refreshBackgroundTargets(): void {
    if (this.backgroundSelector) {
      this.backgroundTargets = Array.from(
        document.querySelectorAll<HTMLElement>(this.backgroundSelector),
      );
      if (this.backgroundTargets.length > 0) return;
    }

    if (this.backgroundTargets.length === 0) {
      const container = document.getElementById("main-container");
      if (container) {
        this.backgroundTargets = [container];
      } else {
        const bodyChildren = Array.from(document.body.children).filter(
          (el) => el !== this.targetDialog && el instanceof HTMLElement,
        ) as HTMLElement[];
        this.backgroundTargets = bodyChildren;
      }
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      if (this.onEscapeCallback) {
        this.onEscapeCallback();
      }
      return;
    }

    if (e.key === "Tab") {
      const focusables = this.getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (
          document.activeElement === first ||
          !this.targetDialog.contains(document.activeElement)
        ) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (
          document.activeElement === last ||
          !this.targetDialog.contains(document.activeElement)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  private getFocusableElements(): HTMLElement[] {
    return Array.from(
      this.targetDialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  activate(fallbackOpener?: HTMLElement | null): void {
    if (document.activeElement instanceof HTMLElement) {
      this.opener = document.activeElement;
    } else {
      this.opener = fallbackOpener || null;
    }

    this.backgroundTargets = [];
    this.refreshBackgroundTargets();

    for (const bg of this.backgroundTargets) {
      this.backgroundInertState.set(bg, bg.hasAttribute("inert"));
      bg.setAttribute("inert", "");
    }

    window.addEventListener("keydown", this.handleKeyDown);

    // Initial focus
    const focusables = this.getFocusableElements();
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      const headingOrDialog =
        this.targetDialog.querySelector<HTMLElement>("h2, h3, [tabindex]") ||
        this.targetDialog;
      headingOrDialog.setAttribute("tabindex", "-1");
      headingOrDialog.focus();
    }
  }

  deactivate(): void {
    window.removeEventListener("keydown", this.handleKeyDown);

    for (const bg of this.backgroundTargets) {
      if (this.backgroundInertState.get(bg)) {
        bg.setAttribute("inert", "");
      } else {
        bg.removeAttribute("inert");
      }
    }
    this.backgroundInertState.clear();

    if (this.opener?.isConnected) {
      this.opener.focus();
    } else {
      const fallback = document.querySelector<HTMLElement>(
        "#settings-heading, #settings-area h2, h2, #settings-area",
      );
      if (fallback) {
        fallback.setAttribute("tabindex", "-1");
        fallback.focus();
      }
    }
    this.opener = null;
  }
}
