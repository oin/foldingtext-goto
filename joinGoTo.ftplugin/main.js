define(function(require, exports, module) {
	'use strict';

  function truncateLeft(str, n, separator) {
    return (str.length > n) ? str.substr(0, n-1) + separator : str;
  };
  var truncateMiddle = function (fullStr, strLen, separator) {
    if (fullStr.length <= strLen) return fullStr;

    separator = separator || '...';

    var sepLen = separator.length,
    charsToShow = strLen - sepLen,
    frontChars = Math.ceil(charsToShow/2),
    backChars = Math.floor(charsToShow/2);

    return fullStr.substr(0, frontChars) + 
    separator + 
    fullStr.substr(fullStr.length - backChars);
  };
	function removeAccents(it) {
		return it.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
	};
	function escapeHtml(unsafe) {
		return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
	}
	var fuzzysort = require('./fuzzysort.js');

  var getCaretCoordinates = require('./textarea-caret-position/index.js').Coordinates;
  var debug = false;
  var selectionBug = {
    exists: false,
    determined: false,
    firstChar: undefined
  };
  var p = function (opts) {
    var COMMAND_LEFT = 91,
      COMMAND_RIGHT = 93,
      RETURN = 13,
      ESC = 27,
      KEY_A = 65,
      KEY_Z = 90,
      KEY_SPACE = 32,
      ARROW_UP = 38,
      ARROW_DOWN = 40,
      no_op = function () {};    // no-op function to use as default
    
    // define default options
    this.options = {
      className: 'JKPanel',
      placeholder: 'enter text...',
      onTextChange: no_op,
      onBlur: no_op,
      onReturn: no_op,
      onEscape: no_op,
      onCommand: no_op,
      onMenuSelect: no_op,
      spaceSelectsMenuItem: false,
      ignoreWhiteSpace: true,
      addToDOM: true
    }
    
    // copy options from argument
    for (var op in opts) {

      if ( this.options[op] === undefined ) {
        console.log('JKPanel: \'' + op + '\' is not a valid option. Ignoring.');
      } else if ( typeof this.options[op] !== typeof opts[op] ) {
        console.log( 'JKPanel: Option \'' + op + '\' must be of type ' + 
          typeof this.options[op] + '. Reverting to default.' );
      } else {
        this.options[op] = opts[op]
      }
    }
    
    // TODO hide following properties
    this._isShown = false;    
    this._isMenuShown = false;
    this.currentValue = '';
    this.currentMenuItems = [];
    
    // add unsettable properties
    Object.defineProperty(
      this,
      'element',
      { value: document.createElement('div') }
    );
    Object.defineProperty(
      this,
      'input',
      { value: document.createElement('input') }
    );
    
    // set panel attributes
    this.element.style.display = 'none';       // don't show panel at first
    
    this.input.setAttribute('type', 'text');
    this.input.setAttribute('value', '');
    this.input.setAttribute('placeholder', this.options.placeholder);
    if (this.options.className) {
      this.element.classList.add(this.options.className);
    }
    
    this.element.insertBefore(this.input, null); // add the input to the panel
    
    
    // EVENTS
    
    // when editor is clicked
    this.bodyClickListener = (function (event) {
      if (debug) console.log('click triggered on body');
      
      var performDefault;
      if (this.options.onBlur && this.options.onBlur !== no_op) {
        performDefault = this.options.onBlur(event, this);
      }
      if (performDefault !== false) {     // panel's default behavior
        this.hide(true);    // close the panel, keep contents
      }

    }).bind(this);
    
    // prevent a click on the panel from closing it
    this.element.addEventListener('mousedown', (function (event) {
      event.stopPropagation();
    }).bind(this));
    
    // capture changes to input
    this.input.addEventListener('input', (function(event) {
      if (debug) console.log( 'input change event: \'' + this.input.value + '\'' );
      
      // basic test for the Mountain Lion selection range bug on the 'input' event
  	  if (! selectionBug.determined) {
  		  if (this.input.value.length === 1) {
    			selectionBug.firstChar = this.input.value;
        
  		  } else if (this.input.value.length === 2) {
    			if (this.input.value.charAt(0) === selectionBug.firstChar 
    			  && this.input.selectionStart === 1) {
    				// could give false positive in this case:
    				// enter char 'a', move cursor back and enter same letter
    				selectionBug.exists = true;
    			}
        
    			selectionBug.determined = true;
  		  }
  		}
      
      if (this.options.ignoreWhiteSpace) {
        if ( this.input.value.trim() === this.currentValue ) {
          if (debug) console.log( 'No change' );
          
        } else {
          if (debug) console.log( 'Text changed' );
          this.currentValue = this.input.value.trim();
    
          if (this.options.onTextChange && this.options.onTextChange !== no_op) {
            this.options.onTextChange(event, this);
          }
        }
      } else {
        if (this.options.onTextChange && this.options.onTextChange !== no_op) {
          this.options.onTextChange(event, this);
        }
      }
        
    }).bind(this));
        
    // capture keydowns (for command keys, etc.)
    this.element.addEventListener('keydown', (function(event) {
      if (debug) console.log('keydown: ' + event.which);
      
      if (event.which === RETURN) {                  // return key pressed
        
        var performDefault;
        if (this.options.onReturn && this.options.onReturn !== no_op ) {
          performDefault = this.options.onReturn(event, this);
        }
        if (performDefault !== false) {      // panel's default behavior
          this.hide(true);
          event.preventDefault();
        }
        
      } else if ( event.which === COMMAND_LEFT ) {     // command keys pressed
        this.keysDown[COMMAND_LEFT] = true;
        
      } else if ( event.which === COMMAND_RIGHT ) {
        this.keysDown[COMMAND_RIGHT] = true;
        
      } else if ( event.which === ESC ) {            // escape key pressed
        
        var performDefault;
        if ( this.options.onEscape && this.options.onEscape !== no_op ) {
          this.options.onEscape( event, this );
        }
        if ( performDefault !== false ) {        // panel's default behavior
          this.hide(true);
          event.preventDefault();
        }
        
      } else if ( this.keysDown[COMMAND_LEFT] || this.keysDown[COMMAND_RIGHT] || event.getModifierState("Meta") ) {
        // Modify behavior of some command combinations
        
        var performDefault;
        if ( this.options.onCommand && this.options.onCommand !== no_op ) {
          performDefault = this.options.onCommand( event, this );
        }
        if (performDefault !== false ) {
          if ( event.which === KEY_A ) {           // Command + A
            this.input.select();
            event.preventDefault();            
          } else if ( event.which === KEY_Z ) {    // Command + Z
            event.preventDefault();
          }
        }
        
      }
    }).bind(this));
    
    // capture keyups (for command keys, etc.)
    this.input.addEventListener('keyup', (function(event) {
      if (debug) console.log('keyup: ' + event.which)
      if (debug) console.log(this.keysDown)
            
      if (event.which === COMMAND_LEFT) {          // left command key
        this.keysDown[COMMAND_LEFT] = false;
      } else if (event.which === COMMAND_RIGHT) {  // right command key
        this.keysDown[COMMAND_RIGHT] = false;
      }
      
    }).bind(this))
    
    // menu keydown events; added to element in showMenu() method
    // TODO also select item when space key is pressed?
    this.menuOpenKeyDownListener = (function(event) {
      
      if ( event.which === ARROW_UP ) {
        var active = this.menu.querySelector('li.' + this.data.menuActiveClass);
        var item = active.previousSibling;
        while (item && item.classList.contains(this.data.itemHiddenClass)) {
          item = item.previousSibling;
        }
        if (item) {
          active.classList.remove(this.data.menuActiveClass);
          item.classList.add(this.data.menuActiveClass);
          item.scrollIntoView();
          this.options.onMenuSelect(event, this, item.dataset.id);
        }
        event.preventDefault();
        event.stopPropagation();
        
      } else if ( event.which === ARROW_DOWN ) {
        var active = this.menu.querySelector('li.' + this.data.menuActiveClass);
        var item = active.nextSibling;
        while (item && item.classList.contains(this.data.itemHiddenClass)) {
          item = item.nextSibling;
        }
        if (item) {
          active.classList.remove(this.data.menuActiveClass);
          item.classList.add(this.data.menuActiveClass);     
          item.scrollIntoView();
          this.options.onMenuSelect(event, this, item.dataset.id);
        }
        event.preventDefault();
        event.stopPropagation();
        
      } else if ( event.which === RETURN || 
        (this.options.spaceSelectsMenuItem && event.which === KEY_SPACE) ) {
        var active = this.menu.querySelector('li.' + this.data.menuActiveClass);
        var value = null;
        if (active) {
          value = active.dataset.id;
        }

        var performDefault;
        if ( this.options.onMenuSelect && this.options.onMenuSelect !== no_op ) {
          performDefault = this.options.onMenuSelect( event, this, value );
        }
        
        if (performDefault !== false) {
          this.hideMenu();
          // event.preventDefault();
          // event.stopPropagation();
        }
        
      } else if ( event.which === ESC ) {
        this.hideMenu();
        // event.preventDefault();
        // event.stopPropagation();
        // var performDefault;
        // if ( this.options.onEscape && this.options.onEscape !== no_op ) {
        //   this.options.onEscape( event, this );
        // }
        // if ( performDefault !== false ) {        // panel's default behavior
        //   this.hide(false);
        //   event.preventDefault();
        // }
      }
      
    }).bind(this);
    
    // add panel to DOM    
    if ( this.options.addToDOM ) {
      document.body.insertBefore( this.element, null );
    }
  };
  Object.defineProperty( p.prototype, 'keysDown', { value: {} } );
  Object.defineProperty( p.prototype, 'data', {
    value: {
      menuActiveClass: 'active',
      itemHiddenClass: 'hidden'
    }
  });
  p.prototype.addToDOM = function () {
    document.body.insertBefore( this.element, null );
  };
  p.prototype.show = function ( text, selection, selectionEnd ) {
    if ( (text && typeof text === 'string') || text === '' ) {
      this.input.value = text;
    }
    this.element.style.display = 'block';
    this.input.focus();
    
    if (! selection || selection === 'around' ) {
      this.input.select();          // select contents
    } else if ( selection === 'start' ) {
      this.input.setSelectionRange(0, 0);
    } else if ( selection === 'end' ) {
      var length = this.input.value.length
      this.input.setSelectionRange(length, length);
    } else if (typeof selection === 'number' ) {
      var end = selectionEnd || selection;
      this.input.setSelectionRange(selection, end);
    } else if ( selection === 'preserve' ) {
      // do nothing; yes, this is probably sloppy
    } else {
      this.input.select();          // select for other values
    }

    if ( this.options.ignoreWhiteSpace ) {
      this.currentValue = this.input.value.trim();
    }
    
    if (! this._isShown) { // make sure only adding listener once
      window.document.body.addEventListener('mousedown', this.bodyClickListener);
    }
    
    this._isShown = true;
  };
  p.prototype.hide = function ( keepContents ) {
    if ( ! keepContents === true ) {
      this.input.value = '';
    }
    if ( this.options.ignoreWhiteSpace ) {
      this.currentValue = this.input.value.trim();
    }
    
    window.document.body.removeEventListener('mousedown', this.bodyClickListener);
    
    this.element.style.display = 'none';
    editor.focus();
    this._isShown = false;
  };
  p.prototype.toggle = function ( keepContents, text ) {
    if ( this._isShown ) {
      this.hide( keepContents );
    } else {
      this.show( text );
    }
  };
  p.prototype.clear = function () {
    this.input.value = '';
  };
  p.prototype.value = function () {
    if ( this.options.ignoreWhiteSpace ) {
      return this.input.value.trim();
    } else {
      return this.input.value;
    }
  };
  p.prototype.isShown = function () {
    return this._isShown;
  }
  p.prototype.showMenu = function (query, items, shouldSelect, idThatShouldBeSelected) {
    
    // if (items && ! (items instanceof Array && (items[0] instanceof String || 
    //   typeof items[0] === 'string') )) {
      
    //   console.log("Items argument must be array of strings.")
    //   return;
    // }

    // create menu if doesn't exist
    if (! this.menu) {
      Object.defineProperty(
        this,
        'menu',
        { value: document.createElement('ul') }
      );
      this.menu.style.display = 'none';
      this.menu.style.position = 'absolute';
      this.element.appendChild(this.menu);
            
      this.menu.addEventListener('mousedown', (function (event) {
        if (debug) console.log('mousedown triggered on menu');
        
        var value = event.target.dataset.id;

        var performDefault;
        if ( this.options.onMenuSelect /* && this.options.onMenuSelect !== no_op */ ) {
          performDefault = this.options.onMenuSelect( event, this, value, true );
        }
      
        if (performDefault !== false) {
          this.input.focus();
          this.hideMenu();
          event.preventDefault();
        }

      }).bind(this));
      
      // this.menu.addEventListener('mouseover', (function (event) {
      //   if (debug) console.log(event.target);
        
      //   var active = this.menu.querySelector('li.' + this.data.menuActiveClass);
        
      //   if (event.target.parentNode && event.target.parentNode === this.menu && 
      //     ! event.target.classList.contains(this.data.itemHiddenClass) ) {
      //     // TODO assumes that parentNode of the item is the menu!
          
      //     if (active) {
      //       active.classList.remove(this.data.menuActiveClass);
      //     }
      //     event.target.classList.add(this.data.menuActiveClass);
      //   }
        
      // }).bind(this));
      
    }

    // check whether items are different
    var different = false;
    if (! items) {
    	// do nothing
    } else if (items.length !== this.currentMenuItems.length) {
    	different = true;
	} else {
		for (var i = 0; i < items.length; i++) {
			if (items[i] !== this.currentMenuItems[i]) {
				different = true;
				break;
			}
		}
    }

    var liThatShouldBeSelected = null;
    
    // clear and re-populate menu
    if (different) { // only if items array different
      if (debug) console.log('New set of menu items: ' + items);
      
      while (this.menu.hasChildNodes()) {
          this.menu.removeChild(this.menu.lastChild);
      }
      for (var i = 0; i < items.length; i++) {
        var li = document.createElement('li');
        var iti = items[i];
        if(iti.html) {
        	li.innerHTML = iti.html;
        } else {
        	li.textContent = iti.text;
        }
        li.classList.add(iti.class);
        li.dataset.id = iti.id;
        li.dataset.search = iti.search;
        li.dataset.text = iti.text;
        li.dataset.context = iti.context;
        this.menu.appendChild(li);
        if(!shouldSelect && idThatShouldBeSelected && iti.id == idThatShouldBeSelected) {
      		liThatShouldBeSelected = li;
      	}
      }
      
      this.currentMenuItems = items;
    }

    var refreshMenu = (function (query, shouldSelect) {
      var active = this.menu.querySelector('li.' + this.data.menuActiveClass);
      if (active) {
        active.classList.remove(this.data.menuActiveClass);
      }
    
      // remove and add 'hidden' class
      var li = this.menu.firstChild;
      var count = 0;
      while (li) {
        li.classList.remove(this.data.itemHiddenClass);
        if(query && query.length > 0) {
        	// var result = fuzzysort.single(escapeHtml(query), escapeHtml(li.dataset.search));
        	// if (!result || result.indexes.length == 0) {
	        if (! li.textContent.match(query) ) {
	          li.classList.add(this.data.itemHiddenClass);
	          // li.textContent = li.dataset.text;
	        } else {
	          // li.innerHTML = fuzzysort.highlight(result, '<strong>', '</strong>');
	          count++;
	        }
        } else {
        	// li.textContent = li.dataset.text;
        	count++;
        }
        li = li.nextSibling;
      }

      // highlight first menu item
      li = this.menu.firstChild;
      while (li && li.classList.contains(this.data.itemHiddenClass)) {
        li = li.nextSibling;
      }
      if (li) {
      	if(shouldSelect || !idThatShouldBeSelected) {
      		li.classList.add(this.data.menuActiveClass);
	        if(shouldSelect) {
	        	this.options.onMenuSelect(event, this, li.dataset.id);
	        }
      	}
      }
      
      return count;
      
    }).bind(this);
  
    var count = refreshMenu(query, shouldSelect);
    if (count === 0) {
      this.hideMenu();
      return;
    }
    
    // add event listeners
    if (! this._isMenuShown) { // ensure that listener is added only once
      this.input.addEventListener('keydown', this.menuOpenKeyDownListener);
    }
    
    // TODO changing menu position should be optional
    var coordinates = getCaretCoordinates(this.input, this.input.selectionEnd);
    if (! this._isMenuShown) { // don't move menu if it's already shown
      this.menu.style.left = coordinates.left + 'px';
    }
    
    this.menu.style.display = 'block';
    this._isMenuShown = true;

    if(count && liThatShouldBeSelected) {
    	liThatShouldBeSelected.classList.add(this.data.menuActiveClass);
  		liThatShouldBeSelected.scrollIntoView();
    }
    
  };
  
  p.prototype.hideMenu = function () {
    if (this._isMenuShown === false) {
      return;
    }
    
    if (this.menu) {
      this.menu.style.display = 'none';
    }
    if (this.menuOpenKeyDownListener) {
      this.input.removeEventListener('keydown', this.menuOpenKeyDownListener);
    }
    
    this._isMenuShown = false;
  };
  
  p.prototype.isMenuShown = function () {
    return this._isMenuShown;
  };
  
  p.prototype.selection = function (event) {
  
    var selectionStart = this.input.selectionStart; // WARNING: doesn't support IE
    var selectionEnd = this.input.selectionEnd;

	  if (event && event.type === 'input') {
	    // the bug only occurs during the 'input' event. During 'keydown' input has
      // not  changed; during 'keyup' input has changed and selection has been
      // updated; but during 'input', input has changed and (in Mountain Lion),
      // selection in many cases has *not* been updated.
      
      // TODO this bug does not show after pressing forward/backward delete;
      // should check for that
	  
  		if (selectionBug.exists) {
  		  // prior to 10.9, selectionEnd is 1 less than it should be, but only after
  		  // the first character has been entered in the input. I.e. it's 1, 1, 2...
  		  // if there 
  		  if (! this.input.value.match(/^.?$/)) { // TODO heuristic; will not always work
    			if (selectionStart !== 0) {
    				selectionStart = selectionStart + 1;
    			}
    			if (selectionEnd !== 0) {
    			  selectionEnd = selectionEnd + 1;
    			}
  		  }
  		}
    }
    
    return [selectionStart, selectionEnd];
  };
  var Panel = p;

	var Extensions = require('ft/core/extensions').Extensions;
	var editor = null;
	var panel = null;
	var shown = false;
	var hasMoved = false;
	var savedNodePath = null;
	var savedSelectedRange = null;
	// var savedViewportRange = null;
	var list = [];

	function currentQuery() {
		var query = panel.currentValue;
		// query = new RegExp('.*' + query.split(' ').join('.*') + '.*', 'i');
		query = new RegExp('.*' + query.split('').join('.*') + '.*', 'i');
		return query;
	}
	function updateMenu(shouldSelect, nodeIdThatShouldBeSelected) {
		// panel.showMenu(currentQuery(), list);
		// panel.showMenu(panel.currentValue, list);
		var query = panel.currentValue;
		var flist = [];
		if(query && query.length > 0) {
			var results = fuzzysort.go(removeAccents(query), list, { key: 'search' });
			for(var i=0; i<results.length; ++i) {
				var r = results[i];
				var fr = Object.assign({}, r.obj);
				r.target = fr.text;
				fr.html = fuzzysort.highlight(r);
				flist.push(fr);
			}
		} else {
			flist = list;
		}
		panel.showMenu(null, flist, shouldSelect, nodeIdThatShouldBeSelected);
	}
	function contextString(headings, level) {
    var str = "";
    var limit = 30;
    do {
      var l = [];
      for(var i=level - 1; i >= 1; --i) {
        var hi = headings[i];
        if(hi) {
          l.push(truncateLeft(hi, limit, "…"));
          // l.push(hi);
        }
      }
      var str = "";
      if(l.length) {
        str = "< " + l.join(" < ");
      }
      limit = Math.round(limit * 0.75);
    } while(str.length > 60);
		
		return str;
    // return truncateMiddle(str, 50, "…");
	}
	function searchString(str, headings, level) {
		// var l = [];
		// for(var i=0; i<level; ++i) {
		// 	var hi = headings[i];
		// 	if(hi) {
		// 		l.push(hi);
		// 	}
		// }
		// l.push(str);
		// return l.join(" > ");
		// return str + " " + contextString(headings, level);
		return str;
	}
	function show(editor) {
		savedNodePath = editor.nodePath();
		savedSelectedRange = editor.selectedRange();
		// savedViewportRange = editor.viewportRange();
		
		// Look for the nearest heading in the vicinity
		var nearestNode = editor.selectedRange().startNode;
		while(nearestNode) {
			if(nearestNode.type() == "heading") {
				break;
			}
			var previous = nearestNode.previousLineNode();
			if(!previous) {
				nearestNode = null;
				break;
			}
			nearestNode = previous;
		}

		if(nearestNode) {
			nearestNode = nearestNode.id;
		}

		// rebuild list
		list = [];
		var currentHeading = {};
		var nodes = editor.tree().nodes();
		for(var i=0; i<nodes.length; ++i) {
			var node = nodes[i];
			if(node.type() == "heading") {
				var text = node.text();
				var level = node.typeIndentLevel();
				var str = removeAccents(searchString(text, currentHeading, level));
				var cls = 'heading' + level;

				currentHeading[level] = text;
				list.push({
					class: cls,
					text: text,
					id: node.id,
					search: str,
					context: contextString(currentHeading, level)
				});
			}
		}

		panel.input.value = '';
		panel.show();
		updateMenu(false, nearestNode);
		hasMoved = false;
		shown = true;
	}
	function hide(editor, restore) {
		if(restore && hasMoved) {
			if(savedNodePath) {
				editor.setNodePath(savedNodePath);
			}
			if(savedSelectedRange) {
				editor.setSelectedRange(savedSelectedRange);
			}
			// if(savedViewportRange) {
			// 	editor.scrollRangeToVisible(savedViewportRange);
			// }
		}
		panel.hide(true);
		shown = false;
	}

	Extensions.add('com.foldingtext.editor.commands', {
		name: 'go to heading',
		description: 'List and filter headings',
		performCommand: function (editor) {
			if(shown) {
				hide(editor, true);
			} else {
				show(editor);
			}
		}
	});

	Extensions.addInit(function(ed) {
		editor = ed;
		var pinit = {};
		pinit.onReturn = function() {
			hide(editor, false);
		};
		pinit.onEscape = function() {
			hide(editor, true);
		};
		pinit.onTextChange = function(e) {
			updateMenu(true);
		};
		pinit.onMenuSelect = function(e, p, value, fromClick) {
			var node = null;
			if(value) {
				node = editor.tree().nodeForID(value);
			}
			if(node) {
				// Go to the node
				var range = editor.tree().createRangeFromNodes(node, 0, node, -1);
				editor.setSelectedRange(range);
				hasMoved = true;
				if(fromClick) {
					hide(editor, false);
				}
			} else {
				// Restore saved selection
				if(savedNodePath) {
					editor.setNodePath(savedNodePath);
				}
				if(savedSelectedRange) {
					editor.setSelectedRange(savedSelectedRange);
				}
			}
		};
		pinit.onCommand = function(e, p) {
			if(e.which == 82) {
				hide(editor, true);
			}
		};
		pinit.placeholder = "Go to heading...";
		pinit.spaceSelectsMenuItem = false;
		pinit.ignoreWhiteSpace = true;
		panel = new Panel(pinit);
	});

	Extensions.add('com.foldingtext.editor.init', function (editor) {
		editor.addKeyMap({
			'Cmd-R' : 'go to heading',
		});
	});


});
