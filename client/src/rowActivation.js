function shouldActivateRow(event) {
  if (event.defaultPrevented || event.button !== 0) {
    return false;
  }

  const target = event.target instanceof Element ? event.target : null;

  if (target?.closest("button, a, input, select, textarea, label")) {
    return false;
  }

  const selectedText = window.getSelection?.()?.toString().trim();
  return !selectedText;
}

export function getActivatableRowProps(onActivate) {
  return {
    role: "button",
    "aria-haspopup": "dialog",
    onClick: (event) => {
      if (!shouldActivateRow(event)) {
        return;
      }

      onActivate();
    },
    tabIndex: 0,
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
