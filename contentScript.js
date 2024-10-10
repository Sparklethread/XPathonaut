let highlightedElement = null;

/**
 * Highlights the element corresponding to the given XPath by adding a red outline.
 * @param {string} xpath - The XPath of the element to highlight.
 */
function highlightElement(xpath) {
  // Remove outline from previously highlighted element
  if (highlightedElement) {
    highlightedElement.style.outline = '';
  }

  // Find the element using XPath
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  const element = result.singleNodeValue;

  if (element) {
    // Add a red outline to the element
    element.style.outline = '2px solid red';
    highlightedElement = element;
  }
}

/**
 * Removes the highlight from the currently highlighted element.
 */
function removeHighlight() {
  if (highlightedElement) {
    highlightedElement.style.outline = '';
    highlightedElement = null;
  }
}

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'highlight') {
    highlightElement(request.xpath);
  } else if (request.action === 'removeHighlight') {
    removeHighlight();
  }
});
