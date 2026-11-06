document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-worldz-checkout]");
  if (!button) return;

  const form = button.closest(".shopify-section")?.querySelector('form[action*="/cart/add"]')
    ?? document.querySelector('form[action*="/cart/add"]');
  const variantId = form?.querySelector('[name="id"]')?.value ?? button.dataset.defaultVariant;
  const quantity = form?.querySelector('[name="quantity"]')?.value ?? "1";
  const error = button.parentElement.querySelector("[data-worldz-error]");
  const checkout = new URL("/apps/worldz-payments/checkout", window.location.origin);
  checkout.searchParams.set("variant", variantId);
  checkout.searchParams.set("quantity", quantity);

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  window.location.assign(checkout.toString());
  window.setTimeout(() => {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (error) {
      error.hidden = false;
      error.textContent = "Could not open NEAR checkout. Refresh and try again.";
    }
  }, 8000);
});
