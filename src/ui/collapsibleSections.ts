export function bindCollapsibleSections(root: ParentNode = document): void {
  root
    .querySelectorAll<HTMLButtonElement>("[data-collapse-toggle]")
    .forEach((button) => {
      button.addEventListener("click", () => toggleSection(button));
    });
}

function toggleSection(button: HTMLButtonElement): void {
  const section = button.closest<HTMLElement>("[data-collapsible-section]");
  if (!section) {
    return;
  }
  const collapsed = section.classList.toggle("collapsed");
  const expanded = !collapsed;
  button.textContent = expanded ? "Hide" : "Show";
  button.setAttribute("aria-expanded", String(expanded));
}
