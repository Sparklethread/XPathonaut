// Add event listener to the "Extract" button
document.getElementById('extractBtn').addEventListener('click', () => {
  // Get the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Execute a script in the context of the active tab
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        func: () => {
          // Function to get relative XPath of an element
          function getXPath(element) {
            if (element.id) {
              return `//*[@id="${element.id}"]`;
            }
            if (element.name) {
              return `//*[@name="${element.name}"]`;
            }
            if (element === document.body) {
              return '/html/body';
            }

            let ix = 0;
            const siblings = element.parentNode.childNodes;
            for (let i = 0; i < siblings.length; i++) {
              const sibling = siblings[i];
              if (sibling === element) {
                const tagName = element.tagName.toLowerCase();
                return getXPath(element.parentNode) + '/' + tagName + `[${ix + 1}]`;
              }
              if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                ix++;
              }
            }
          }

          // Function to get absolute XPath of an element
          function getAbsoluteXPath(element) {
            let comp, comps = [];
            let parent = null;
            let xpath = '';
            let getPos = function (element) {
              let position = 1, sibling;
              if (element.nodeType === Node.ATTRIBUTE_NODE) {
                return null;
              }
              for (sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
                if (sibling.nodeType === Node.DOCUMENT_TYPE_NODE) {
                  continue;
                }
                if (sibling.nodeName === element.nodeName) {
                  ++position;
                }
              }
              return position;
            };

            if (element instanceof Document) {
              return '/';
            }

            for (; element && !(element instanceof Document); element = element.nodeType === Node.ATTRIBUTE_NODE ? element.ownerElement : element.parentNode) {
              comp = comps[comps.length] = {};
              switch (element.nodeType) {
                case Node.TEXT_NODE:
                  comp.name = 'text()';
                  break;
                case Node.ATTRIBUTE_NODE:
                  comp.name = '@' + element.nodeName;
                  break;
                case Node.PROCESSING_INSTRUCTION_NODE:
                  comp.name = 'processing-instruction()';
                  break;
                case Node.COMMENT_NODE:
                  comp.name = 'comment()';
                  break;
                case Node.ELEMENT_NODE:
                  comp.name = element.tagName.toLowerCase();
                  break;
              }
              comp.position = getPos(element);
            }

            for (let i = comps.length - 1; i >= 0; i--) {
              comp = comps[i];
              xpath += '/' + comp.name;
              if (comp.position != null) {
                xpath += '[' + comp.position + ']';
              }
            }

            return xpath;
          }

          // Select all visible input fields and buttons
          const elements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), button, select, textarea');
          const visibleElements = Array.from(elements).filter(el => el.offsetParent !== null);

          // Map each element to its XPaths
          const data = visibleElements.map(el => {
            const xpaths = [];

            // Absolute XPath
            const absoluteXPath = getAbsoluteXPath(el);
            xpaths.push(absoluteXPath);

            // Relative XPath
            const relativeXPath = getXPath(el);
            xpaths.push(relativeXPath);

            // Attribute-based XPaths (including attributes that contain 'name')
            const attributeBasedXPaths = getAttributeBasedXPaths(el);
            xpaths.push(...attributeBasedXPaths);

            return { elementHTML: el.outerHTML, xpaths };
          });

          // Return the data to the popup script
          return data;

          /**
           * Generates attribute-based XPaths for an element using attributes that contain 'name'.
           * @param {Element} el - The DOM element.
           * @returns {Array} - An array of XPaths.
           */
          function getAttributeBasedXPaths(el) {
            const attributeXPaths = [];
            const attrs = el.attributes;
            for (let i = 0; i < attrs.length; i++) {
              const attrName = attrs[i].name;
              const attrValue = attrs[i].value;
              if (attrName.includes('name') && attrValue) {
                const xpath = `//*[@${attrName}="${attrValue}"]`;
                attributeXPaths.push(xpath);
              }
            }
            return attributeXPaths;
          }
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        } else {
          // Display the results in the popup
          displayResults(results[0].result);
        }
      }
    );
  });
});

// Add event listener to the "Export All XPaths" button
document.getElementById('exportBtn').addEventListener('click', () => {
  exportXPaths();
});

// Array to store all XPaths for exporting
let allXPaths = [];

/**
 * Displays the extracted XPaths in the popup.
 * @param {Array} data - The array of elements and their XPaths.
 */
function displayResults(data) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '';
  allXPaths = [];

  data.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'xpath-item';

    const elementTitle = document.createElement('h3');
    elementTitle.textContent = `Element ${index + 1}:`;
    itemDiv.appendChild(elementTitle);

    const elementHTML = document.createElement('div');
    elementHTML.innerHTML = item.elementHTML;
    elementHTML.className = 'element-html';
    itemDiv.appendChild(elementHTML);

    item.xpaths.forEach((xpath, idx) => {
      const xpathP = document.createElement('p');
      xpathP.textContent = `XPath ${idx + 1}: ${xpath}`;
      itemDiv.appendChild(xpathP);

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy XPath ' + (idx + 1);
      copyBtn.className = 'copy-btn';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(xpath).then(() => {
          alert('XPath copied to clipboard!');
        });
      });
      itemDiv.appendChild(copyBtn);

      // Add hover event listeners to highlight the element on the page
      xpathP.addEventListener('mouseover', () => {
        sendMessageToContentScript('highlight', xpath);
      });

      xpathP.addEventListener('mouseout', () => {
        sendMessageToContentScript('removeHighlight');
      });

      allXPaths.push(xpath);
    });

    resultsDiv.appendChild(itemDiv);
  });
}

/**
 * Sends a message to the content script to highlight or remove highlight from an element.
 * @param {string} action - The action to perform ('highlight' or 'removeHighlight').
 * @param {string} [xpath=''] - The XPath of the element to highlight.
 */
function sendMessageToContentScript(action, xpath = '') {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: action, xpath: xpath });
  });
}

/**
 * Exports all collected XPaths to a text file.
 */
function exportXPaths() {
  if (allXPaths.length === 0) {
    alert('No XPaths to export. Click "Extract" to retrieve XPaths.');
    return;
  }

  const blob = new Blob([allXPaths.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'xpaths.txt';
  a.click();
  URL.revokeObjectURL(url);
}
