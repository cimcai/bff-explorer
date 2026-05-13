export function bindCollapsibleSections(root: ParentNode = document): void {
  root
    .querySelectorAll<HTMLElement>("[data-collapse-toggle]")
    .forEach((toggle) => {
      toggle.addEventListener("click", () => toggleSection(toggle));
      toggle.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        toggleSection(toggle);
      });
    });
}

function toggleSection(toggle: HTMLElement): void {
  const section = toggle.closest<HTMLElement>("[data-collapsible-section]");
  if (!section) {
    return;
  }
  const collapsed = section.classList.toggle("collapsed");
  const expanded = !collapsed;
  toggle.setAttribute("aria-expanded", String(expanded));
}
