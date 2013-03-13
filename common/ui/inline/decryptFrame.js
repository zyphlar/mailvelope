/**
 * Mailvelope - secure email with OpenPGP encryption for Webmail
 * Copyright (C) 2012  Thomas Oberndörfer
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var DecryptFrame = DecryptFrame || (function() { 

  var decryptFrame = function (prefs) {
    this.id = mvelo.getHash();
    // text node with Armor Tail Line '-----END PGP...'
    this._pgpEnd;
    // parent node of _pgpEnd 
    this._pgpParent;
    // node that contains complete ASCII Armored Message
    this._pgpElement;
    this._pgpElementAttr = {};
    // type of message: message, signed, public key...
    this._pgpMessageType;
    this._dFrame;
    this._dDialog;
    this._port;
    this._refreshPosIntervalID;
    this._displayMode = prefs.security.display_decrypted;
  }

  decryptFrame.prototype = {

    constructor: DecryptFrame,

    attachTo: function(pgpEnd) {
      this._init(pgpEnd);
      this._getMessageType();
      // currently only this type supported
      if (this._pgpMessageType === mvelo.PGP_MESSAGE || this._pgpMessageType === mvelo.PGP_SIGNATURE) {
        this._renderFrame();
        this._establishConnection();
        this._registerEventListener();
      }
      // set status to attached
      this._pgpEnd.data(mvelo.FRAME_STATUS, mvelo.FRAME_ATTACHED);
      // store frame obj in pgpText tag
      this._pgpEnd.data(mvelo.FRAME_OBJ, this);
    },
  
    _init: function(pgpEnd) {
      this._pgpEnd = pgpEnd;
      this._pgpParent = this._pgpEnd.parent();
      
      var regex = /BEGIN\sPGP/;
      this._pgpElement = this._pgpParent;
      while (!regex.test(this._pgpElement.text())) {
        this._pgpElement = this._pgpElement.parent(); 
      }
      this._pgpElementAttr.marginTop = parseInt(this._pgpElement.css('margin-top'), 10);
    },

    _getMessageType: function() {
      var armored = this._pgpElement.text();
      if (/BEGIN\sPGP\sMESSAGE/.test(armored)) {
        this._pgpMessageType = mvelo.PGP_MESSAGE;
      } else if (/BEGIN\sPGP\sSIGNATURE/.test(armored)) {
        this._pgpMessageType = mvelo.PGP_SIGNATURE;
      } else if (/BEGIN\sPGP\sPUBLIC\sKEY\sBLOCK/.test(armored)) {
        this._pgpMessageType = mvelo.PGP_PUBLIC_KEY;
      } else if (/BEGIN\sPGP\sPRIVATE\sKEY\sBLOCK/.test(armored)) {
        this._pgpMessageType = mvelo.PGP_PRIVATE_KEY;
      }
    },
    
    _renderFrame: function() {
      var that = this;
      this._dFrame = $('<div/>', {
        id: 'dFrame-' + that.id,
        'class': 'm-frame',
        html: '<a class="m-frame-close">×</a>'
      });
      
      this._setFrameDim();
      
      this._dFrame.insertAfter(this._pgpElement);
      if (this._pgpElement.height() > mvelo.LARGE_FRAME) {
        this._dFrame.addClass('m-frame-large');
      }
      this._dFrame.addClass('m-decrypt-key-cursor');
      this._dFrame.fadeIn('slow');
      
      this._dFrame.on('click', this._clickHandler.bind(this));
      this._dFrame.find('.m-frame-close').on('click', this._closeFrame.bind(this));
      
      $(window).resize(this._setFrameDim.bind(this));
      this._refreshPosIntervalID = window.setInterval(this._setFrameDim.bind(this), 1000);
    },
    
    _clickHandler: function() {
      this._dFrame.off('click');
      this._toggleIcon();
      if (this._displayMode == mvelo.DISPLAY_INLINE) {
        this._inlineDialog();
      } else if (this._displayMode == mvelo.DISPLAY_POPUP) {
        this._popupDialog();
      }
      return false;
    },
    
    _closeFrame: function(finalClose) {
      this._dFrame.fadeOut((function() {
        window.clearInterval(this._refreshPosIntervalID);
        $(window).off('resize');
        this._dFrame.remove();
        if (finalClose === true) {
          this._port.disconnect();
          this._pgpEnd.data(mvelo.FRAME_STATUS, null);
        } else {
          this._pgpEnd.data(mvelo.FRAME_STATUS, mvelo.FRAME_DETACHED);
        }
        this._pgpEnd.data(mvelo.FRAME_OBJ, null);
      }).bind(this));
      return false;
    },
    
    _toggleIcon: function(callback) {
      if (this._dFrame.hasClass('m-frame-large')) {
        this._dFrame.toggleClass('m-frame-large-open');
      } else {
        this._dFrame.toggleClass('m-frame-open');
      }
      if (mvelo.crx) {
        this._dFrame.one('webkitTransitionEnd', callback);  
      } else {
        this._dFrame.one('transitionend', callback);
      }
    },
    
    _setFrameDim: function() {
      var pgpElementPos = this._pgpElement.position();
      this._dFrame.width(this._pgpElement.width() - 2);
      this._dFrame.height(this._pgpParent.position().top + this._pgpParent.height() - pgpElementPos.top - 2);
      this._dFrame.css('top', pgpElementPos.top + this._pgpElementAttr.marginTop);
    },
    
    _inlineDialog: function() {
      var that = this;
      this._dDialog = $('<iframe/>', {
        id: 'dDialog-' + that.id,
        'class': 'm-frame-dialog',
        frameBorder: 0, 
        scrolling: 'no'
      });
      var path = 'common/ui/inline/dialogs/decryptInline.html?id=' + that.id;
      var url;
      if (mvelo.crx) {
        url = mvelo.extension.getURL(path);
      } else {
        url = 'http://www.mailvelope.com/' + path;
      }
      this._dDialog.attr('src', url);
      this._dFrame.append(this._dDialog);
      this._setFrameDim();
      this._dFrame.removeClass('m-decrypt-key-cursor');
      this._dDialog.fadeIn();
    },

    _popupDialog: function() {
      this._port.postMessage({
        event: 'dframe-display-popup', 
        sender: 'dFrame-' + this.id
      });
      this._dFrame.removeClass('m-decrypt-key-cursor');
    },
    
    _establishConnection: function() {
      var that = this;
      this._port = mvelo.extension.connect({name: 'dFrame-' + that.id});
      //console.log('Port connected: %o', this._port);
    },
    
    _removeDialog: function() {
      if (this._displayMode === mvelo.DISPLAY_INLINE) {
        this._dDialog.fadeOut();
        // removal triggers disconnect event
        this._dDialog.remove();
        this._dDialog = null;
      }
      this._dFrame.addClass('m-decrypt-key-cursor');
      this._toggleIcon();
      this._dFrame.on('click', this._clickHandler.bind(this));
    },
    
    _getArmoredMessage: function() {
      //if (this._pgpElement.is('pre')) {
      //  return this._pgpElement.text();
      //} else {
        var msg = this._pgpElement.html();
        msg = msg.replace(/\n/g, ' '); // replace new line with space
        msg = msg.replace(/(<br>)/g, '\n'); // replace <br> with new line
        msg = msg.replace(/<(\/.+?)>/g, '\n'); // replace closing tags </..> with new line
        msg = msg.replace(/<(.+?)>/g, ''); // remove opening tags
        
        msg = msg.replace(/&nbsp;/g, ' '); // replace non-breaking space with whitespace
        //msg = msg.replace(/\n\s+/g, '\n'); // compress sequence of whitespace and new line characters to one new line
        var msgRegex;
        if(this._pgpMessageType === mvelo.PGP_MESSAGE){
          msgRegex = /-----BEGIN PGP MESSAGE-----[\s\S]+?-----END PGP MESSAGE-----/;
        }
        else if(this._pgpMessageType === mvelo.PGP_SIGNATURE){
          msgRegex = /-----BEGIN PGP SIGNED MESSAGE-----[\s\S]+?-----END PGP SIGNATURE-----/;
        }
        else {
          console.log("Error: unable to _getArmoredMessage for the correct _pgpMessageType.")
        }
        msg = msg.match(msgRegex)[0];
        msg = msg.replace(/:.*\n(?!.*:)/, '$&\n');  // insert new line after last armor header
        return msg;
      //}
    },
    
    _registerEventListener: function() {
      var that = this;
      this._port.onMessage.addListener(function(msg) {
        //console.log('dFrame-%s event %s received', that.id, msg.event);
        switch (msg.event) {
          case 'remove-dialog':
          case 'dialog-cancel':
            that._removeDialog();
            break;
          case 'armored-message':
            var thisMessageType;
            if(this._pgpMessageType === mvelo.PGP_SIGNATURE){
              thisMessageType = 'dframe-armored-signed-message'
            }
            else {
              thisMessageType = 'dframe-armored-message'
            }
            that._port.postMessage({
              event: thisMessageType, 
              data: that._getArmoredMessage(),
              sender: 'dFrame-' + that.id
            });
            break;
          case 'destroy':
            that._closeFrame(true);
            break;
          default:
            console.log('unknown event');
        }
      });
    }
  
  };

  decryptFrame.isAttached = function(element) {
    var status = element.data(mvelo.FRAME_STATUS);
    switch (status) {
      case mvelo.FRAME_ATTACHED:
      case mvelo.FRAME_DETACHED:
        return true;
        break;
      default:
        return false;
    }    
  }

  return decryptFrame;

}());
