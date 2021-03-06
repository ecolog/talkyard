/* Buttons that go to the next/previous post or backwards and forwards.
 * Copyright (C) 2014-2016 Kaj Magnus Lindberg
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/// <reference path="../../../node_modules/@types/keymaster/index.d.ts" />
/// <reference path="../utils/react-utils.ts" />
/// <reference path="../widgets.ts" />
/// <reference path="../utils/DropdownModal.ts" />

//------------------------------------------------------------------------------
   namespace debiki2.page {
//------------------------------------------------------------------------------

const keymaster: Keymaster = window['keymaster'];
const r = ReactDOMFactories;
const calcScrollIntoViewCoordsInPageColumn = debiki2.utils.calcScrollIntoViewCoordsInPageColumn;

export var addVisitedPosts: (currentPostNr: number, nextPostNr: number) => void = _.noop;
export var addVisitedPositionAndPost: (nextPostNr: number) => void = _.noop;
export var addVisitedPosition: (whereNext?) => void = _.noop;

var WhereTop = 'T';
var WhereReplies = 'R';
var WhereComments = 'C';
var WhereBottom = 'B';
var SmallDistancePx = 5;

function scrollToTop(addBackStep?) {
  if (addBackStep !== false) {
    addVisitedPosition(WhereTop);
  }
  utils.scrollIntoViewInPageColumn('#thePageTop');
}

function scrollToReplies(addBackStep?) {
  if (addBackStep !== false) {
    addVisitedPosition(WhereReplies);
  }
  utils.scrollIntoViewInPageColumn(
    // dupl code [5UKP20]
    '.dw-depth-0 > .dw-p-as', { marginTop: 65, marginBottom: 9999 });
}
function scrollToComments(addBackStep?) {
  if (addBackStep !== false) {
    addVisitedPosition(WhereComments);
  }
  utils.scrollIntoViewInPageColumn(
    // dupl code [5UKP20]
    '.s_PgSct-Prg', { marginTop: 65, marginBottom: 9999 });
}

function scrollToBottom(addBackStep?) {
  if (addBackStep !== false) {
    addVisitedPosition(WhereBottom);
  }
  // dupl code [5UKP20]
  utils.scrollIntoViewInPageColumn('#thePageBottom');
}


var scrollButtonsDialog;

function openScrollButtonsDialog(openButton) {
  if (!scrollButtonsDialog) {
    scrollButtonsDialog = ReactDOM.render(ScrollButtonsDropdownModal(), utils.makeMountNode());
  }
  scrollButtonsDialog.openAt(openButton);
}


export function closeAnyScrollButtons() {
  if (scrollButtonsDialog) {
    scrollButtonsDialog.close();
  }
}


export var ScrollButtons = createClassAndFactory({
  getInitialState: function() {
    return {
      visitedPosts: [],
      currentVisitedPostIndex: -1,
      isShown: false,
    };
  },

  componentDidMount: function() {
    // Similar code here: [5KFEWR7]
    // COULD_OPTIMIZE? Perhaps sync all those time callbacks, so done in same reflow?
    setTimeout(this.showOrHide, 250);

    addVisitedPosts = this.addVisitedPosts;
    addVisitedPositionAndPost = this.addVisitedPositionAndPost;
    addVisitedPosition = this.addVisitedPosition;
    keymaster('b', this.goBack);
    keymaster('f', this.goForward);
    keymaster('1', scrollToTop);
    keymaster('2', scrollToReplies);
    keymaster('3', scrollToComments);
    keymaster('4', scrollToBottom);
  },

  componentWillUnmount: function() {
    this.isGone = true;
    addVisitedPosts = _.noop;
    addVisitedPositionAndPost = _.noop;
    addVisitedPosition = _.noop;
    keymaster.unbind('b', 'all');
    keymaster.unbind('f', 'all');
    keymaster.unbind('1', 'all');
    keymaster.unbind('2', 'all');
    keymaster.unbind('3', 'all');
  },

  showOrHide: function() {
    if (this.isGone) return;
    let pageColumnElem = $byId('esPageScrollable');
    let pageHasScrollbars = pageColumnElem.scrollHeight > window.innerHeight;
    if (this.state.isShown !== pageHasScrollbars) {
      this.setState({ isShown: pageHasScrollbars });
    }
    setTimeout(this.showOrHide, 500);
  },

  // Crazy with number | string. Oh well, fix later [3KGU02] CLEAN_UP
  addVisitedPosts: function(currentPostId: number, nextPostNr: number | string) {
    var visitedPosts = this.state.visitedPosts; // TODO clone, don't modify visitedPosts directly below [immutablejs]
    visitedPosts.splice(this.state.currentVisitedPostIndex + 1, 999999);
    // Don't duplicate the last post, and also remove it if it is empty, which happens when
    // a position without any post is added via this.addVisitedPosition().
    var lastPost = visitedPosts[visitedPosts.length - 1];
    var lastPosHasCoords;
    if (lastPost) {
      lastPosHasCoords = _.isNumber(lastPost.windowLeft) && _.isNumber(lastPost.windowTop);
      var lastPosHasPostNr = !isNullOrUndefined(lastPost.postNr);
      var isSameAsCurrent = lastPosHasPostNr && lastPost.postNr === currentPostId;
      var isNothing = !lastPosHasPostNr && !lastPosHasCoords;
      if (isSameAsCurrent || isNothing) {
        visitedPosts.splice(visitedPosts.length - 1, 1);
        lastPost = undefined;
        lastPosHasCoords = undefined;
      }
    }
    var currentPos = {
      windowLeft: $byId('esPageColumn').scrollLeft,
      windowTop: $byId('esPageColumn').scrollTop,
      postNr: currentPostId
    };
    var lastPosTop = lastPost ? lastPost.windowTop : undefined;
    var lastPosLeft = lastPost ? lastPost.windowLeft : undefined;
    if (lastPost && _.isString(lastPost.postNr)) {
      lastPosLeft = _.isNumber(lastPosLeft) ? lastPosLeft : currentPos.windowLeft;
      switch(lastPost.postNr) {
        case WhereTop:
          lastPosTop = 0;
          break;
        case WhereBottom:
          // DUPL CODE, fix  [5UKP20]
          lastPosTop = calcScrollIntoViewCoordsInPageColumn('#thePageBottom').desiredParentTop;
          break;
        case WhereReplies:
          // DUPL CODE, fix  [5UKP20]
          lastPosTop =
            calcScrollIntoViewCoordsInPageColumn(
                '.dw-depth-0 > .dw-p-as', { marginTop: 65, marginBottom: 9999 }).desiredParentTop;
          break;
        case WhereComments:
          // DUPL CODE, fix  [5UKP20]
          lastPosTop =
            calcScrollIntoViewCoordsInPageColumn(
              '.s_PgSct-Prg', { marginTop: 65, marginBottom: 9999 }).desiredParentTop;
          break;
        default: die('EsE2YWK4X8');
      }
    }
    if (isNullOrUndefined(currentPostId) && lastPost && _.isNumber(lastPost.postNr) &&
        !_.isNumber(lastPosTop)) {
      var post = $byId('post-' + lastPost.postNr);
      var scrollCoords = calcScrollIntoViewCoordsInPageColumn(post);
      lastPosTop = scrollCoords.desiredParentTop;
      lastPosLeft = scrollCoords.desiredParentLeft;
    }
    if (_.isNumber(currentPostId) || !_.isNumber(lastPosTop)) {
      visitedPosts.push(currentPos);
    }
    else {
      // If currentPos is almost the same as lastPost, skip currentPos.
      var distX = currentPos.windowLeft - lastPosLeft;
      var distY = currentPos.windowTop - lastPosTop;
      var distSquared = distX * distX + distY * distY;
      // 60 pixels is nothing, only add new pos if has scrolled further away than that.
      if (distSquared > 60*60) {  // COULD use 160 px instead if wide screen
        visitedPosts.push(currentPos);
      }
    }
    visitedPosts.push({ postNr: nextPostNr });
    this.setState({
      visitedPosts: visitedPosts,
      currentVisitedPostIndex: visitedPosts.length - 1,
    });
  },

  addVisitedPositionAndPost: function(nextPostNr: number) {
    this.addVisitedPosts(null, nextPostNr);
  },

  addVisitedPosition: function(whereNext?) {
    this.addVisitedPosts(null, whereNext);
  },

  canGoBack: function() {
    return this.state.currentVisitedPostIndex >= 1;
  },

  canPerhapsGoForward: function() {
    return this.state.currentVisitedPostIndex >= 0 &&
        this.state.currentVisitedPostIndex < this.state.visitedPosts.length - 1;
  },

  openScrollButtonsDialog: function(event) {
    openScrollButtonsDialog(event.target);
  },

  goBack: function() {
    if (!this.canGoBack()) return;
    const backPost = this.state.visitedPosts[this.state.currentVisitedPostIndex - 1];
    const nextIndex = this.state.currentVisitedPostIndex - 1;
    this.setState({
      currentVisitedPostIndex: nextIndex,
    });
    const pageColumnElem = $byId('esPageColumn');
    if (_.isNumber(backPost.windowLeft)) {
      if (backPost.windowLeft === pageColumnElem.scrollLeft &&
          backPost.windowTop === pageColumnElem.scrollTop) {
        // Apparently the user has already scrolled back to the previous location, manually,
        // and then clicked Back. A bit weird. Could perhaps scroll to the next 'visitedPosts'
        // instead, but simpler to just:
        return;
      }
      // Restore the original window top and left coordinates, so the Back button
      // really moves back to the original position.
      smoothScroll(pageColumnElem, backPost.windowLeft, backPost.windowTop);
      if (backPost.postNr) {
        ReactActions.loadAndShowPost(backPost.postNr);
      }
    }
    else if (_.isString(backPost.postNr)) {  // crazy, oh well [3KGU02]
      switch (backPost.postNr) {
        case WhereTop: scrollToTop(false); break;
        case WhereReplies: scrollToReplies(false); break;
        case WhereComments: scrollToComments(false); break;
        case WhereBottom: scrollToBottom(false); break;
        default: die('EsE4KGU02');
      }
    }
    else {
      ReactActions.loadAndShowPost(backPost.postNr);
    }
  },

  // Only invokable via the 'F' key — I rarely go forwards, and a button makes the UI to cluttered.
  goForward: function() {
    if (!this.canPerhapsGoForward()) return;
    const forwPost = this.state.visitedPosts[this.state.currentVisitedPostIndex + 1];
    if (forwPost.postNr) {
      ReactActions.loadAndShowPost(forwPost.postNr);
    }
    else if (forwPost.windowTop) {
      smoothScroll($byId('esPageColumn'), forwPost.windowLeft, forwPost.windowTop);
    }
    else {
      // Ignore. Empty objects are added when the user uses the Top/Replies/Chat/End
      // naviation buttons.
      return;
    }
    this.setState({
      currentVisitedPostIndex: this.state.currentVisitedPostIndex + 1,
    });
  },

  render: function() {
    if (!this.state.isShown)
      return null;

    const openScrollMenuButton = Button({ className: 'esScrollBtns_menu', ref: 'scrollMenuButton',
        onClick: this.openScrollButtonsDialog }, t.sb.Scroll);

    // UX: Don't show num steps one can scroll back, don't: "Back (4)" — because people
    // sometimes think 4 is a post number.
    const scrollBackButton =
        Button({ className: 'esScrollBtns_back', onClick: this.goBack,
            title: t.sb.BackExpl,
            disabled: this.state.currentVisitedPostIndex <= 0 },
          r.span({ className: 'esScrollBtns_back_shortcut' }, t.sb.Back_1), t.sb.Back_2);

    return (
      r.div({ className: 'esScrollBtns_fixedBar' },
        r.div({ className: 'container' },
          r.div({ className: 'esScrollBtns' },
            openScrollMenuButton, scrollBackButton))));
  }
});


// some dupl code [6KUW24]
const ScrollButtonsDropdownModal = createComponent({
  getInitialState: function () {
    return {
      isOpen: false,
      enableGotoTopBtn: false,
      enableGotoEndBtn: true,
      store: ReactStore.allData(),
    };
  },

  onChange: function() {
    this.setState({ store: debiki2.ReactStore.allData() });
  },

  openAt: function(at) {
    const rect = at.getBoundingClientRect();
    const calcCoords = calcScrollIntoViewCoordsInPageColumn;
    const bottomCoords = calcCoords('#thePageBottom', {
      marginTop: SmallDistancePx,
      marginBottom: -SmallDistancePx,
    });
    this.setState({
      isOpen: true,
      atX: rect.left - 160,
      atY: rect.bottom,
      enableGotoTopBtn: $byId('esPageColumn').scrollTop > SmallDistancePx,
      enableGotoEndBtn: bottomCoords.needsToScroll,
      enableGotoRepliesBtn:
        calcCoords('.dw-depth-0 > .dw-p-as', { marginTop: 65, marginBottom: 200 }).needsToScroll,
      enableGotoCommentsBtn:
        calcCoords('.s_PgSct', { marginTop: 65, marginBottom: 200 }).needsToScroll,
    });
  },

  close: function() {
    this.setState({ isOpen: false });
  },

  scrollToTop: function() {
    scrollToTop();
    this.close();
  },

  scrollToReplies: function() {
    scrollToReplies();
    this.close();
  },

  scrollToComments: function() {
    scrollToComments();
    this.close();
  },

  scrollToEnd: function() {
    scrollToBottom();
    this.close();
  },

  render: function() {
    const state = this.state;
    const store: Store = this.state.store;
    const page: Page = store.currentPage;
    const pageRole: PageRole = page.pageRole;
    const isChat = page_isChatChannel(pageRole);
    const neverHasReplies = pageRole === PageRole.CustomHtmlPage || pageRole === PageRole.WebPage ||
        isSection(pageRole);

    let content;
    if (state.isOpen) {
      const scrollToTopButton = isChat ? null :
        PrimaryButton({ className: 'esScrollDlg_Up', onClick: this.scrollToTop, title: t.sb.PgTopHelp,
            disabled: !state.enableGotoTopBtn },
          r.span({},
            r.span({ className: 'esScrollDlg_Up_Arw' }, '➜'), t.sb.PgTop));

      const scrollToRepliesButton = isChat || neverHasReplies ? null :
        PrimaryButton({ className: 'esScrollDlg_Replies', onClick: this.scrollToReplies,
            title: t.sb.ReplHelp, disabled: !state.enableGotoRepliesBtn },
          r.span({ className: 'icon-reply' }, t.sb.Repl));

      const scrollToCommentsButton = isChat || neverHasReplies ? null :
        PrimaryButton({ className: 'esScrollDlg_Comments', onClick: this.scrollToComments,
            title: t.sb.ProgrHelp, disabled: !state.enableGotoCommentsBtn },
          r.span({ className: 'icon-comment' }),
          r.span({ className: 'esScrollDlg_Comments_Text' }, t.sb.Progr));

      const scrollToEndButton = PrimaryButton({ className: 'esScrollDlg_Down',
          onClick: this.scrollToEnd, title: t.sb.BtmHelp,
          disabled: !state.enableGotoEndBtn },
        r.span({},
          r.span({ className: 'esScrollDlg_Down_Arw' }, '➜'), isChat ? t.sb.PgBtm : t.sb.Btm));

      const shortcutsArray = [];
      if (scrollToTopButton) shortcutsArray.push("1");
      if (scrollToRepliesButton) shortcutsArray.push("2");
      if (scrollToCommentsButton) shortcutsArray.push("3");
      if (scrollToEndButton) shortcutsArray.push("4");
      const shortcutsText = shortcutsArray.join(", ");

      content =
          r.div({},
            r.p({ className: 'esScrollDlg_title' }, t.sb.ScrollToC),
              scrollToTopButton, scrollToRepliesButton, scrollToCommentsButton, scrollToEndButton,
            r.p({ className: 'esScrollDlg_shortcuts' },
              t.KbdShrtcsC, r.b({}, shortcutsText),
              t.sb.Kbd_1, r.b({}, "B"), t.sb.Kbd_2));  // ", and B to scroll back"
    }

    // (allowFullWidth, because this dialog isn't tall, so will be space above/below to click
    // to close.)
    return (
      utils.DropdownModal({ show: state.isOpen, onHide: this.close, atX: state.atX, atY: state.atY,
          pullLeft: true, className: 'esScrollDlg', allowFullWidth: true }, content));
  }
});


//------------------------------------------------------------------------------
   }
//------------------------------------------------------------------------------
// vim: fdm=marker et ts=2 sw=2 tw=0 fo=tcqwn list
