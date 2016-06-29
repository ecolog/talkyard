/*
 * Copyright (c) 2015-2016 Kaj Magnus Lindberg
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

/// <reference path="../../typedefs/react/react.d.ts" />
/// <reference path="../../typedefs/lodash/lodash.d.ts" />
/// <reference path="../prelude.ts" />
/// <reference path="../constants.ts" />
/// <reference path="../utils/react-utils.ts" />
/// <reference path="../editor/editor.ts" />
/// <reference path="../login/login-dialog.ts" />
/// <reference path="../utils/window-zoom-resize-mixin.ts" />
/// <reference path="../utils/DropdownModal.ts" />
/// <reference path="../util/ExplainingDropdown.ts" />
/// <reference path="../Server.ts" />
/// <reference path="../ServerApi.ts" />
/// <reference path="../page/discussion.ts" />
/// <reference path="../page/scroll-buttons.ts" />

//------------------------------------------------------------------------------
   module debiki2.forum {
//------------------------------------------------------------------------------

var d = { i: debiki.internal, u: debiki.v0.util };
var r = React.DOM;
var reactCreateFactory = React['createFactory'];
var ReactBootstrap: any = window['ReactBootstrap'];
var Button = reactCreateFactory(ReactBootstrap.Button);
var DropdownModal = utils.DropdownModal;
var ExplainingListItem = util.ExplainingListItem;
type ExplainingTitleText = util.ExplainingTitleText;
var MenuItem = reactCreateFactory(ReactBootstrap.MenuItem);
var Input = reactCreateFactory(ReactBootstrap.Input);
var HelpMessageBox = debiki2.help.HelpMessageBox;

var ReactRouter = window['ReactRouter'];
var Route = reactCreateFactory(ReactRouter.Route);
var IndexRoute = reactCreateFactory(ReactRouter.IndexRoute);
var Redirect = reactCreateFactory(ReactRouter.Redirect);
var Link = reactCreateFactory(ReactRouter.Link);

var MaxWaitingForCritique = 10; // for now only [plugin]

/** Keep in sync with app/controllers/ForumController.NumTopicsToList. */
var NumNewTopicsPerRequest = 40;

// The route with path 'latest' or 'top' or 'categories'. It determines the sort order
// (latest first, or best first).
var SortOrderRouteIndex = 1;

var FilterShowAll = 'ShowAll';
var FilterShowWaiting = 'ShowWaiting';
var FilterShowDeleted = 'ShowDeleted';


export function buildForumRoutes() {
  var store: Store = ReactStore.allData();
  var rootSlash = store.pagePath.value;
  var rootNoSlash = rootSlash.substr(0, rootSlash.length - 1);
  var defaultPath = rootSlash + (store.showForumCategories ? RoutePathCategories : RoutePathLatest);

  return [
    Redirect({ key: 'redirA', from: rootSlash, to: defaultPath }),
    Redirect({ key: 'redirB', from: rootNoSlash, to: defaultPath }),
    Route({ key: 'theRoutes', path: rootSlash, component: ForumComponent },
      Redirect({ from: RoutePathLatest + '/', to: rootSlash + RoutePathLatest }),
      Redirect({ from: RoutePathTop + '/', to: rootSlash + RoutePathTop }),
      Redirect({ from: RoutePathCategories + '/', to: rootSlash + RoutePathCategories }),
      Route({ path: RoutePathLatest, component: ForumTopicListComponent },
        IndexRoute({ component: ForumTopicListComponent }),
        Route({ path: ':categorySlug', component: ForumTopicListComponent })),
      Route({ path: RoutePathTop, component: ForumTopicListComponent },
        IndexRoute({ component: ForumTopicListComponent }),
        Route({ path: ':categorySlug', component: ForumTopicListComponent })),
      Route({ path: RoutePathCategories, component: ForumCategoriesComponent }))];
}


export var ForumScrollBehavior = {
  updateScrollPosition: function(position, actionType) {
    // Never change scroll position when switching between last/top/categories
    // in the forum. Later on I might find this behavior useful:
    //   https://github.com/rackt/react-router/blob/master/behaviors/ImitateBrowserBehavior.js
    //   https://github.com/rackt/react-router/blob/master/docs/api/components/Route.md#ignorescrollbehavior
    //   https://github.com/rackt/react-router/blob/master/docs/api/create.md#scrollbehavior
    //   https://github.com/rackt/react-router/pull/388
    return;
  }
};


var ForumComponent = React.createClass(<any> {
  mixins: [debiki2.StoreListenerMixin],

  getInitialState: function() {
    return debiki2.ReactStore.allData();
  },

  onChange: function() {
    this.setState(debiki2.ReactStore.allData());
    // Now some time has passed since this page was loaded, so:
    this.setState({ topicsInStoreMightBeOld: true });
  },

  getActiveCategory: function() {
    var activeCategory: any;
    var activeCategorySlug = this.props.params.categorySlug;
    if (activeCategorySlug) {
      // (( Old comment, for react-router 0.13, now I use 2.0:
      // Don't know why, but sometimes after having edited or created a category and
      // then transitioned to its edited/new slug, then getParams().categorySlug
      // still points to the old previous slug. Therefore, if we didn't find
      // activeCategorySlug, try this.state.newCategorySlug instead. ))
      activeCategory = _.find(this.state.categories, (category: Category) => {
        return category.slug === activeCategorySlug;
      });
      if (!activeCategory) {
        activeCategory = _.find(this.state.categories, (category: Category) => {
          var match = category.slug === this.state.newCategorySlug;
          console.warn("Weird this.state.categories code is needed [EsE5GUKS2]");
          return match;
        });
      }
    }
    if (!activeCategory) {
      activeCategory = {
        name: "All categories",
        id: this.state.categoryId, // the forum root category id
        isForumItself: true,
        newTopicTypes: [],
      };
    }
    return activeCategory;
  },

  makeHelpMessage: function(category: Category): any {
    var store: Store = this.state;
    var me: Myself = store.me;
    if (!_.isEqual(category.newTopicTypes, [PageRole.Critique])) // [plugin] ...
      return null;

    if (!me.isAuthenticated)
      return { id: 'EdHKEW21', version: 1, content: r.span({},
          r.p({}, "Click ", r.b({}, "Log In"), ", to the right just above.")) };

    // For now only.  [85SKW32]
    if (this.state.numWaitingForCritique >= MaxWaitingForCritique) //  [plugin]
      return { id: 'Es5GUPM2', version: 1, alwaysShow: true, isWarning: true, content: r.span({},
        r.p({}, r.b({}, "You cannot currently ask for critique"),
          " — too many topics waiting for critique already."),
        r.p({}, "Check back later. Or send an email to me, kaj.magnus.lindberg at gmail dot com, " +
          "and tell me to notify you when you can ask for critique again.")) };

    // if too-few-topics then
    return { id: 'EdH4KBP2', version: 1, content: r.span({},  // [plugin]
        r.p({}, "You can click ", r.b({}, "Ask for Critique"), " (to the right just below)."),
        r.p({}, "(Normally, you would need to first help others and gather credits, " +
          "before you can ask for critique yourself. But right now there are few " +
          "open topics here, so you can ask directly instead.)")) };

    // enough credits: [plugin]:
    // return { id: 'EdH8PU01', version: 1, content: r.span({}, "Click Ask for Critique") };
    // else:
    // return { id: 'EdH4KGU0', version: 1, content:
    //   Select a topic that you'd like to critique:
    //    (You need credits, before you can ask for critique yourself — and you get credits, by
    //    critiquing to others.)
    // }
  },

  render: function() {
    var store: Store = this.state;
    var activeCategory = this.getActiveCategory();
    var helpMessage = this.makeHelpMessage(activeCategory);
    helpMessage = helpMessage
        ? debiki2.help.HelpMessageBox({ message: helpMessage })
        : null;

    var childProps = _.assign({}, this.state, {
      store: store,
      route: this.props.route,
      location: this.props.location,
      activeCategory: activeCategory,
      numWaitingForCritique: this.state.numWaitingForCritique,  // for now only [plugin]
      setNumWaitingForCritique: (numWaiting) => {               // for now only [plugin]
        if (this.state.numWaitingForCritique !== numWaiting)
          this.setState({ numWaitingForCritique: numWaiting });
      },
    });

    // Should I use named components instead of manually passing all route stuff to ForumButtons?
    // https://github.com/rackt/react-router/blob/v2.0.0-rc5/docs/API.md#named-components
    var forumButtonProps = _.assign({}, childProps, {
      route: this.props.route,
      routes: this.props.routes,
      location: this.props.location,
      params: this.props.params,
    });

    var topsAndCatsHelp = this.props.routes[SortOrderRouteIndex].path === RoutePathCategories
      ? HelpMessageBox({ message: topicsAndCatsHelpMessage, className: 'esForum_topicsCatsHelp' })
      : null;

    return (
     r.div({},
      debiki2.reactelements.TopBar({}),
      debiki2.page.ScrollButtons(),
      r.div({ className: 'container dw-forum' },
        // Include .dw-page to make renderDiscussionPage() in startup.js run: (a bit hacky)
        r.div({ className: 'dw-page' }),
        ForumIntroText(this.state),
        helpMessage,
        ForumButtons(forumButtonProps),
        topsAndCatsHelp,
        React.cloneElement(this.props.children, childProps))));
  }
});


var topicsAndCatsHelpMessage = {
  id: 'EsH4YKG81',
  version: 1,
  content: r.span({},
    "A ", r.i({}, r.b({}, "category")), " is a group of topics. " +
    "A ", r.i({}, r.b({}, "topic")), " is a discussion or question."),
};


var ForumIntroText = createComponent({
  render: function() {
    var user: Myself = this.props.me;
    var introPost = this.props.allPosts[BodyId];
    if (!introPost || introPost.isPostHidden)
      return null;

    var anyEditIntroBtn = user.isAdmin
        ? r.a({ className: 'esForumIntro_edit icon-edit', onClick: openEditIntroDialog }, "Edit")
        : null;

    return r.div({ className: 'esForumIntro' },
      r.div({ dangerouslySetInnerHTML: { __html: introPost.sanitizedHtml }}),
      r.div({ className: 'esForumIntro_btns' },
        anyEditIntroBtn,
        r.a({ className: 'esForumIntro_close', onClick: () => ReactActions.showForumIntro(false) },
          r.span({ className: 'icon-cancel' }, "Hide"),
          r.span({ className: 'esForumIntro_close_reopen' },
            ", click ", r.span({ className: 'icon-info-circled dw-forum-intro-show' }),
              " to reopen"))));
  }
});



var ForumButtons = createComponent({
  mixins: [utils.WindowZoomResizeMixin],

  contextTypes: {
    router: React.PropTypes.object.isRequired
  },

  getInitialState: function() {
    return {
      compact: false,
      // [refactor] use ModalDropdownButton instead of all these 3 x open/X/Y fields.
      isCategoryDropdownOpen: false,
      categoryDropdownX: -1,
      categoryDropdownY: -1,
      isSortOrderDropdownOpen: false,
      sortOrderDropdownX: -1,
      sortOrderDropdownY: -1,
      isTopicFilterDropdownOpen: false,
      topicFilterX: -1,
      topicFilterY: -1,
    };
  },

  onWindowZoomOrResize: function() {
    var newCompact = $(window).width() < 801;
    if (this.state.compact !== newCompact) {
      this.setState({ compact: newCompact });
    }
  },

  openCategoryDropdown: function() {
    var rect = ReactDOM.findDOMNode(this.refs.selectCategoryButton).getBoundingClientRect();
    this.setState({ isCategoryDropdownOpen: true, categoryDropdownX: rect.left,
      categoryDropdownY: rect.bottom });
  },

  closeCategoryDropdown: function() {
    this.setState({ isCategoryDropdownOpen: false });
  },

  setCategory: function(newCategorySlug) {
    dieIf(this.props.routes.length < 2, 'EsE6YPKU2');
    this.closeCategoryDropdown();
    var currentPath = this.props.routes[SortOrderRouteIndex].path;
    var nextPath = currentPath === RoutePathCategories ? RoutePathLatest : currentPath;
    var slashSlug = newCategorySlug ? '/' + newCategorySlug : '';
    this.context.router.push({
      pathname: this.props.pagePath.value + nextPath + slashSlug,
      query: this.props.location.query,
    });
  },

  findTheUncategorizedCategory: function() {
    return _.find(this.props.categories, (category: Category) => {
        return category.isTheUncategorizedCategory;
    });
  },

  openSortOrderDropdown: function() {
    var rect = ReactDOM.findDOMNode(this.refs.sortOrderButton).getBoundingClientRect();
    this.setState({ isSortOrderDropdownOpen: true, sortOrderDropdownX: rect.left,
      sortOrderDropdownY: rect.bottom });
  },

  closeSortOrderDropdown: function() {
    this.setState({ isSortOrderDropdownOpen: false });
  },

  setSortOrder: function(newPath: string) {
    this.closeSortOrderDropdown();
    this.context.router.push({
      pathname: this.props.pagePath.value + newPath + this.slashCategorySlug(),
      query: this.props.location.query,
    });
  },

  getSortOrderName: function(sortOrderRoutePath?: string) {
    if (!sortOrderRoutePath) {
      sortOrderRoutePath = this.props.routes[SortOrderRouteIndex].path;
    }
    switch (sortOrderRoutePath) {
      case RoutePathLatest: return "Latest";
      case RoutePathTop: return "Top";
      default: return null;
    }
  },

  setTopicFilter: function(entry: ExplainingTitleText) {
    var newQuery = _.clone(this.props.location.query);
    if (entry.key === FilterShowAll) {
      delete newQuery.filter;
    }
    else {
      newQuery.filter = entry.eventKey;
    }
    this.closeTopicFilterDropdown();
    this.context.router.push({ pathname: this.props.location.pathname, query: newQuery });
  },

  openTopicFilterDropdown: function() {
    var rect = ReactDOM.findDOMNode(this.refs.topicFilterButton).getBoundingClientRect();
    this.setState({ isTopicFilterDropdownOpen: true, topicFilterX: rect.left,
        topicFilterY: rect.bottom });
  },

  closeTopicFilterDropdown: function() {
    this.setState({ isTopicFilterDropdownOpen: false });
  },

  /* If using a filter dropdown + full search text field like GitHub does:
  onActivateFilter: function(event, filterKey: string) {
    this.setState({
      searchFilterKey: filterKey,
      searchText: this.searchTextForFilter(filterKey),
    });
  },

  searchTextForFilter: function(filterKey: string) {
    switch (filterKey) {
      case FilterShowAll: return '';
      case FilterShowWaiting: return 'is:open is:question-or-todo';
      case FilterShowDeleted: ...
    }
  },

  updateSearchText: function(event) {
    this.setState({ searchText: event.target.value });
  }, */

  editCategory: function() {
    debiki2.forum['getEditCategoryDialog'](dialog => {
      if (this.isMounted()) {
        dialog.open(this.props.activeCategory.id);
      }
    });
  },

  createCategory: function() {
    debiki2.forum['getEditCategoryDialog'](dialog => {
      if (this.isMounted()) {
        dialog.open();
      }
    });
  },

  createTopic: function() {
    var anyReturnToUrl = window.location.toString().replace(/#/, '__dwHash__');
    login.loginIfNeeded('LoginToCreateTopic', anyReturnToUrl, () => {
      var category: Category = this.props.activeCategory;
      if (category.isForumItself) {
        category = this.findTheUncategorizedCategory();
        dieIf(!category, "No Uncategorized category [DwE5GKY8]");
      }
      var newTopicTypes = category.newTopicTypes || [];
      if (newTopicTypes.length === 0) {
        debiki2.editor.editNewForumPage(category.id, PageRole.Discussion);
      }
      else if (newTopicTypes.length === 1) {
        debiki2.editor.editNewForumPage(category.id, newTopicTypes[0]);
      }
      else {
        forum['getCreateTopicDialog']().open(category);
      }
    });
  },

  slashCategorySlug: function() {
    return this.props.params.categorySlug ? '/' + this.props.params.categorySlug : '';
  },

  render: function() {
    var state = this.state;
    var props: Store = this.props;
    var me = props.me;
    var activeCategory: Category = this.props.activeCategory;
    if (!activeCategory) {
      // The user has typed a non-existing category slug in the URL. Or she has just created
      // a category, opened a page and then clicked Back in the browser. Then this page
      // reloads, and the browser then uses cached HTML including JSON in which the new
      // category does not yet exist. Let's try to reload the category list page:
      return r.p({},
        "Category not found. Did you just create it? Then reload the page please. [EsE04PK27]");
    }

    var showsCategoryTree = this.props.routes[SortOrderRouteIndex].path === RoutePathCategories;
    var showsTopicList = !showsCategoryTree;

    // A tester got a little bit confused in the categories view, because it starts with
    // the filter-*topics* button. So insert this title, before, instead.
    var anyPageTitle = showsCategoryTree ?
        r.div({ className: 'esF_BB_PageTitle' }, "Categories") : null;

    var makeCategoryLink = (where, text, extraClass?) => Link({
      to: this.props.pagePath.value + where, query: this.props.location.query,
      className: 'btn esForum_catsNav_btn ' + (extraClass || ''),
      activeClassName: 'active' }, text);

    var categoryTreeLink = showsCategoryTree ? null :
      makeCategoryLink(RoutePathCategories, "Categories", 'esForum_navLink');

    // COULD remember which topics were listed previously and return to that view.
    // Or would a Back btn somewhere be better?
    var topicListLink = showsTopicList ? null :
      makeCategoryLink(RoutePathLatest, "Topic list", 'esForum_navLink');

    var categoryMenuItems = props.categories.map((category: Category) => {
      return MenuItem({ eventKey: category.slug, key: category.id,
          active: activeCategory.id === category.id,
          onClick: () => this.setCategory(category.slug) }, category.name);
    });

    var listsTopicsInAllCats =
        // We list topics? (We're not on the Categories route? which lists categories)
        this.props.routes[SortOrderRouteIndex].path !== RoutePathCategories &&
        // No category selected?
        activeCategory.isForumItself;

    categoryMenuItems.unshift(
        MenuItem({ eventKey: null, key: -1, active: listsTopicsInAllCats,
          onClick: () => this.setCategory('') }, "All categories"));

    // [refactor] use ModalDropdownButton instead
    var categoriesDropdown = showsCategoryTree ? null :
        Button({ onClick: this.openCategoryDropdown,
            className: 'esForum_catsNav_btn esForum_catsDrop active',
            ref: 'selectCategoryButton' },
          activeCategory.name + ' ', r.span({ className: 'caret' }));

    var categoriesDropdownModal =
        DropdownModal({ show: state.isCategoryDropdownOpen, pullLeft: true,
            onHide: this.closeCategoryDropdown, atX: state.categoryDropdownX,
            atY: state.categoryDropdownY },
          r.ul({ className: 'dropdown-menu' },
            categoryMenuItems));

    // The Latest/Top/Categories buttons, but use a dropdown if there's not enough space.
    var currentSortOrderPath = this.props.routes[SortOrderRouteIndex].path;
    var latestTopButton;
    var latestTopDropdownModal;
    if (showsCategoryTree) {
      // Then hide the sort topics buttons.
    }
    else if (state.compact) {
      // [refactor] use ModalDropdownButton instead
      latestTopButton =
          Button({ onClick: this.openSortOrderDropdown, ref: 'sortOrderButton',
              className: 'esForum_catsNav_btn esF_BB_SortBtn' },
            this.getSortOrderName() + ' ', r.span({ className: 'caret' }));
      latestTopDropdownModal =
        DropdownModal({ show: state.isSortOrderDropdownOpen, pullLeft: true,
            onHide: this.closeSortOrderDropdown, atX: state.sortOrderDropdownX,
            atY: state.sortOrderDropdownY },
          r.ul({},
            ExplainingListItem({ onClick: () => this.setSortOrder(RoutePathLatest),
                active: currentSortOrderPath === RoutePathLatest,
                title: this.getSortOrderName(RoutePathLatest),
                text: "Shows latest topics first" }),
            ExplainingListItem({ onClick: () => this.setSortOrder(RoutePathTop),
                active: currentSortOrderPath === RoutePathTop,
                title: this.getSortOrderName(RoutePathTop),
                text: "Shows popular topics first" })));
    }
    else {
      var slashSlug = this.slashCategorySlug();
      latestTopButton =
          r.ul({ className: 'nav esForum_catsNav_sort' },
            makeCategoryLink(RoutePathLatest + slashSlug, 'Latest'),
            makeCategoryLink(RoutePathTop + slashSlug, 'Top'));
    }

    // The filter topics select.
    var topicFilterValue = this.props.location.query.filter || FilterShowAll;
    function makeTopicFilterText(filter) {
      switch (filter) {
        case FilterShowAll: return "All topics";
        case FilterShowWaiting: return "Only waiting";
        case FilterShowDeleted: return "Show deleted";
      }
      die('EsE4JK85');
    }

    // [refactor] use ModalDropdownButton instead
    var topicFilterButton =
      Button({ onClick: this.openTopicFilterDropdown,
          className: 'esForum_filterBtn esForum_catsNav_btn', ref: 'topicFilterButton' },
        makeTopicFilterText(topicFilterValue) + ' ', r.span({ className: 'caret' }));

    var showDeletedFilterItem = !isStaff(me) ? null :
      ExplainingListItem({ onSelect: this.setTopicFilter,
        activeEventKey: topicFilterValue, eventKey: FilterShowDeleted,
        title: makeTopicFilterText(FilterShowDeleted),
        text: "Shows all topics, including deleted topics" });

    var topicFilterDropdownModal =
      DropdownModal({ show: state.isTopicFilterDropdownOpen, pullLeft: true,
          onHide: this.closeTopicFilterDropdown, atX: state.topicFilterX,
          atY: state.topicFilterY },
        r.ul({},
          ExplainingListItem({ onSelect: this.setTopicFilter,
              activeEventKey: topicFilterValue, eventKey: FilterShowAll,
              title: "Show all topics",
              text: "Shows all forum topics" }),
          ExplainingListItem({ onSelect: this.setTopicFilter,
              activeEventKey: topicFilterValue, eventKey: FilterShowWaiting,
              title: makeTopicFilterText(FilterShowWaiting),
              text: r.span({},
                "Shows only questions ", r.b({}, r.i({}, "waiting")), " for a solution, " +
                "plus ideas and problems not yet handled" ) }),
          showDeletedFilterItem));

    /* A filter dropdown and search box instead of the <select> above:
    var makeFilterItemProps = (key: string) => {
      var props: any = { eventKey: key };
      if (this.state.searchFilterKey === key) {
        props.className = 'dw-active';
      }
      return props;
    }
    var topicsFilterButton =
        DropdownButton({ title: "Filter", onSelect: this.onActivateFilter, id: ... },
          MenuItem(makeFilterItemProps(FilterShowAll), "Show everything"),
          MenuItem(makeFilterItemProps(FilterShowWaiting), "Show waiting"));
    var topicFilter =
        r.div({ className: 'dw-filter' },
          Input({ type: 'text', buttonBefore: topicsFilterButton, value: this.state.searchText,
              onChange: this.updateSearchText,
              // ElasticSearch disabled server side, and is:* not supported anyway.
              disabled: true, title: "Not completely implemented" }));
    */
    var sortOrderRoutePath = this.props.routes[SortOrderRouteIndex].path;

    var createTopicBtn;
    if (sortOrderRoutePath !== RoutePathCategories && !(
          activeCategory.onlyStaffMayCreateTopics && !isStaff(me))) {
     if (this.props.numWaitingForCritique < MaxWaitingForCritique)  // for now only [plugin]
      createTopicBtn = Button({ onClick: this.createTopic, bsStyle: 'primary', id: 'e2eCreateSth',
          className: 'esF_BB_CreateBtn'},
        createTopicBtnTitle(activeCategory));
    }

    var createCategoryBtn;
    if (sortOrderRoutePath === RoutePathCategories && me.isAdmin) {
      createCategoryBtn = Button({ onClick: this.createCategory, bsStyle: 'primary' },
        'Create Category');
    }

    var editCategoryBtn;
    if (!activeCategory.isForumItself && me.isAdmin) {
      editCategoryBtn = Button({ onClick: this.editCategory, className: 'esF_BB_EditCat' },
        "Edit Category");
    }

    return (
        r.div({ className: 'dw-forum-actionbar clearfix' },
          r.div({ className: 'esForum_catsNav' },
            anyPageTitle,
            categoriesDropdown,
            categoriesDropdownModal,
            latestTopButton,
            latestTopDropdownModal,
            topicFilterButton,
            topicFilterDropdownModal,
            categoryTreeLink,
            topicListLink),
          createTopicBtn,
          createCategoryBtn,
          editCategoryBtn));
  }
});



var ForumTopicListComponent = React.createClass(<any> {
  getInitialState: function(): any {
    // The server has included in the Flux store a list of the most recent topics, and we
    // can use that lis when rendering the topic list server side, or for the first time
    // in the browser (but not after that, because then new topics might have appeared).
    if (!this.props.topicsInStoreMightBeOld && this.isAllLatestTopicsView()) {
      return {
        topics: this.props.topics,
        showLoadMoreButton: this.props.topics.length >= NumNewTopicsPerRequest
      };
    }
    else {
      return {};
    }
  },

  isAllLatestTopicsView: function() {
    dieIf(this.props.routes.length < 2, 'EsE5YPFK23');
    return this.props.routes[SortOrderRouteIndex].path === RoutePathLatest &&
        !this.props.params.categorySlug;
  },

  componentDidMount: function() {
    // This happens when navigating back to the lates-topics list after having shown
    // all categories (plus on initial page load).
    this.loadTopics(this.props, false);
  },

  componentWillReceiveProps: function(nextProps) {
    // This happens when switching category or showing top topics instead of latest topics.
    this.loadTopics(nextProps, false);
  },

  componentDidUpdate: function() {
    processTimeAgo();
  },

  onLoadMoreTopicsClick: function(event) {
    this.loadTopics(this.props, true);
    event.preventDefault();
  },

  loadTopics: function(nextProps, loadMore) {
    var isNewView =
      this.props.location.pathname !== nextProps.location.pathname ||
      this.props.location.search !== nextProps.location.search;

    this.countTopicsWaitingForCritique(); // for now only

    // Avoid loading the same topics many times:
    // - On page load, componentDidMount() and componentWillReceiveProps() both loads topics.
    // - When we're refreshing the page because of Flux events, don't load the same topics again.
    if (!isNewView && !loadMore && (this.state.topics || this.state.isLoading))
      return;

    var orderOffset: OrderOffset = this.getOrderOffset(nextProps);
    orderOffset.topicFilter = nextProps.location.query.filter;
    if (isNewView) {
      this.setState({
        minHeight: $(ReactDOM.findDOMNode(this)).height(),
        topics: null,
        showLoadMoreButton: false
      });
      // Load from the start, no offset. Keep any topic filter though.
      delete orderOffset.time;
      delete orderOffset.numLikes;
    }
    var categoryId = nextProps.activeCategory.id;
    this.setState({ isLoading: true });
    debiki2.Server.loadForumTopics(categoryId, orderOffset, (newlyLoadedTopics: Topic[]) => {
      if (!this.isMounted())
        return;

      var topics: any = isNewView ? [] : (this.state.topics || []);
      topics = topics.concat(newlyLoadedTopics);
      // `topics` includes at least the last old topic twice.
      topics = _.uniqBy(topics, 'pageId');
      this.setState({
        minHeight: null,
        isLoading: false,
        topics: topics,
        showLoadMoreButton: newlyLoadedTopics.length >= NumNewTopicsPerRequest
      });
      this.countTopicsWaitingForCritique(topics); // for now only
    });
  },

  countTopicsWaitingForCritique: function(topics?) { // for now only  [plugin]
    topics = topics || this.state.topics;
    var numWaitingForCritique = 0;
    if (_.isEqual(this.props.activeCategory.newTopicTypes, [PageRole.Critique])) {
      var waitingTopics = _.filter(topics, (topic: Topic) =>
        !topic.closedAtMs && topic.pageRole === PageRole.Critique);
      numWaitingForCritique = waitingTopics.length;
      console.log(numWaitingForCritique + " topics waiting for critique. [EsM8PMU21]");
    }
    this.props.setNumWaitingForCritique(numWaitingForCritique);
  },

  getOrderOffset: function(nextProps?) {
    var props = nextProps || this.props;
    var anyTimeOffset: number;
    var anyLikesOffset: number;
    var anyLastTopic: any = _.last(this.state.topics);
    if (anyLastTopic) {
      // If we're loading more topics, we should continue with this offset.
      anyTimeOffset = anyLastTopic.bumpedEpoch || anyLastTopic.createdEpoch;
      anyLikesOffset = anyLastTopic.numLikes;
    }
    var orderOffset: OrderOffset = { sortOrder: -1 };
    if (props.routes[SortOrderRouteIndex].path === RoutePathTop) {
      orderOffset.sortOrder = TopicSortOrder.LikesAndBumpTime;
      orderOffset.time = anyTimeOffset;
      orderOffset.numLikes = anyLikesOffset;
    }
    else {
      orderOffset.sortOrder = TopicSortOrder.BumpTime;
      orderOffset.time = anyTimeOffset;
    }
    return orderOffset;
  },

  openIconsHelp: function() {
    this.setState({ helpOpened: true });
    ReactActions.showSingleHelpMessageAgain(IconHelpMessage.id);
  },

  render: function() {
    var store: Store = this.props.store;
    if (!this.state.topics) {
      // The min height preserves scrollTop, even though the topic list becomes empty
      // for a short while (which would otherwise reduce the windows height which
      // in turn might reduce scrollTop).
      // COULD make minHeight work when switching to the Categories view too? But should
      // then probably scroll the top of the categories list into view.
      // COULD use this.props.topics, used when rendering server side, but for now:
      return r.p({ style: { minHeight: this.state.minHeight } }, 'Loading...');
    }

    if (!this.state.topics.length)
      return r.p({}, 'No topics.');

    var topics = this.state.topics.map((topic: Topic) => {
      return TopicRow({
          topic: topic, categories: this.props.categories,
          activeCategory: this.props.activeCategory, now: this.props.now,
          key: topic.pageId, routes: this.props.routes, location: this.props.location,
          pagePath: store.pagePath });
    });

    // Insert an icon explanation help message in the topic list. Anywhere else, and
    // people won't see it at the right time, won't understand what the icons mean.
    // It'll be closed by default (click to open) if there are only a few topics.
    // (Because if people haven't seen some icons and started wondering "what's that",
    // they're just going to be annoyed by the icon help tips?)
    var numFewTopics = 10;
    var iconsHelpClosed = !this.state.helpOpened; /* always start closed, for now,
                                                    because doesn't look nice otherwise
        [refactor] So remove this stuff then:
        // User has clicked Hide?
        help.isHelpMessageClosed(store, IconHelpMessage) ||
        // Too few topics, then right now no one cares about the icons?
        (topics.length < numFewTopics && !this.state.helpOpened);
        */
    var iconsHelpStuff = iconsHelpClosed || help.isHelpMessageClosed(store, IconHelpMessage)
        ? r.a({ className: 'esForum_topics_openIconsHelp icon-info-circled',
              onClick: this.openIconsHelp }, "Explain icons...")
        : HelpMessageBox({ message: IconHelpMessage, showUnhideTips: false });
    topics.splice(Math.min(topics.length, numFewTopics), 0,
      r.tr({ key: 'ExplIcns'},
        r.td({ colSpan: 5 }, iconsHelpStuff)));

    var loadMoreTopicsBtn;
    if (this.state.showLoadMoreButton) {
      var orderOffset = this.getOrderOffset();
      var queryString = '?' + debiki2.ServerApi.makeForumTopicsQueryParams(orderOffset);
      loadMoreTopicsBtn =
        r.div({},
          r.a({ className: 'load-more', onClick: this.onLoadMoreTopicsClick,
              href: queryString }, 'Load more ...'));
    }

    var sortingHowTips;
    if (this.getOrderOffset().sortOrder === TopicSortOrder.LikesAndBumpTime) {
      sortingHowTips =
          r.p({ className: 'esForum_sortInfo' }, "Topics with the most Like votes:");
    }

    return (
      r.div({},
        sortingHowTips,
        r.table({ className: 'dw-topic-list' },
          r.thead({},
            r.tr({},
              r.th({}, "Topic"),
              r.th({}, "Category"),
              r.th({}, "Users"),
              r.th({ className: 'num dw-tpc-replies' }, "Replies"),
              r.th({ className: 'num' }, "Activity"))),
              // skip for now:  r.th({ className: 'num' }, "Feelings"))),  [8PKY25]
          r.tbody({},
            topics)),
        loadMoreTopicsBtn));
  }
});


var IconHelpMessage = {
  id: '5KY0W347',
  version: 1,
  content:
    r.div({ className: 'esTopicIconHelp' },
      r.p({ className: 'esTopicIconHelp_intro' }, "Icon explanation:"),
      r.ul({},
        r.li({},
          r.span({ className: 'icon-comment' },
            "A general discussion.")),
        r.li({},
          r.span({ className: 'icon-help-circled' },
            "A question with no accepted answer.")),
        r.li({},
          r.span({ className: 'icon-ok' },
            "A question with an accepted answer.")),
        r.li({},
          r.span({ className: 'icon-idea' },
            "An idea / suggestion.")),
        r.li({},
          r.span({ className: 'icon-attention-circled' },
            "A problem.")),
        r.li({},
          r.span({ className: 'icon-check-empty' },
            "Something we're planning to do or fix.")),
        r.li({},
          r.span({ className: 'icon-check' },
            "Something that's been done or fixed.")),
        r.li({},
          r.span({ className: 'icon-sitemap' },
            "A mind map.")),
        r.li({},
          r.span({ className: 'icon-block' },
            "Topic closed.")),
        r.li({},
          r.span({ className: 'icon-pin' },
            "Topic always listed first (perhaps only in its own category).")))),
};



var TopicRow = createComponent({
  contextTypes: {
    router: React.PropTypes.object.isRequired
  },

  // Currently not in use, see [8PKY25].
  styleFeeeling: function(num, total): any {
    if (!total)
      return null;

    // What we're interested in is the probability that people feel something for this
    // topic? The probability that they like it, or think it's wrong. One weird way to somewhat
    // estimate this, which takes into account uncertainty for topics with very few posts,
    // might be to consider num and total the outome of a binomial proportion test,
    // and use the lower bound of a confidence interval:
    // COULD give greater weight to posts that are shown on page load (when loading the topic).

    // Usually there are not more than `total * 2` like votes, as far as I've seen
    // at some popular topics @ meta.discourse.org. However, Discourse requires login;
    // currently Debiki doesn't.
    var fraction = 1.0 * num / total / 2;
    if (fraction > 1) {
      fraction = 1;
    }
    if (!this.minProb) {
      this.minProb = this.binProbLowerBound(0, 0) + 0.01;
    }
    var probabilityLowerBound = this.binProbLowerBound(total, fraction);
    if (probabilityLowerBound <= this.minProb)
      return null;

    var size = 8 + 6 * probabilityLowerBound;
    var saturation = Math.min(100, 100 * probabilityLowerBound);
    var brightness = Math.max(50, 70 - 20 * probabilityLowerBound);
    var color = 'hsl(0, ' + saturation + '%, ' + brightness + '%)' ; // from gray to red
    return {
      fontSize: size,
      color: color,
    };
  },

  binProbLowerBound: function(sampleSize: number, proportionOfSuccesses: number): number {
    // This is a modified version of the Agresti-Coull method to calculate upper and
    // lower bounds of a binomial proportion. Unknown confidence interval size, I just
    // choose 1.04 below because it feels okay.
    // For details, see: modules/debiki-core/src/main/scala/com/debiki/core/statistics.scala
    var defaultProbability = Math.min(0.5, proportionOfSuccesses);
    var adjustment = 4;
    var n_ = sampleSize + adjustment;
    var p_ = (proportionOfSuccesses * sampleSize + adjustment * defaultProbability) / n_;
    var z_unknownProb = 1.04;
    var square = z_unknownProb * Math.sqrt(p_ * (1 - p_) / n_);
    var lowerBound = p_ - square;
    var upperBound = p_ + square;
    return lowerBound;
  },

  switchCategory: function(category: Category) {
    dieIf(this.props.routes.length < 2, 'EsE5U2Z');
    var sortOrderPath = this.props.routes[SortOrderRouteIndex].path;
    this.context.router.push({
      pathname: this.props.pagePath.value + sortOrderPath + '/' + category.slug,
      query: this.props.location.query,
    });
  },

  render: function() {
    var topic: Topic = this.props.topic;
    var category = _.find(this.props.categories, (category: Category) => {
      return category.id === topic.categoryId;
    });

    /* Skip Feelings for now, mostly empty anyway, doesn't look good. Test to add back  [8PKY25]
    later if people start using Like and Wrong fairly much.
    var feelingsIcons = [];
    var heartStyle = this.styleFeeeling(topic.numLikes, topic.numPosts);
    if (heartStyle) {
      feelingsIcons.push(
          r.span({ className: 'icon-heart', style: heartStyle, key: 'h' }));
    }
    var wrongStyle = this.styleFeeeling(topic.numWrongs, topic.numPosts);
    if (wrongStyle) {
      feelingsIcons.push(
          r.span({ className: 'icon-warning', style: wrongStyle, key: 'w' }));
    }

    var feelings;
    if (feelingsIcons.length) {
      var title =
          topic.numLikes + ' like votes\n' +
          topic.numWrongs + ' this-is-wrong votes';
      feelings =
        r.span({ title: title }, feelingsIcons);
    }
     */

    // COULD change to:
    //  "Created " + debiki.prettyDuration(topic.createdAtMs, Date.now()) + ", on <exact date>"
    // but that won't work server side, because Date.now() changes all the time.
    // Would instead need to generate the tooltip dynamically (rather than include it in the html).
    // [compress]
    var activityTitle = "Created on " + dateTimeFix(topic.createdEpoch);

    if (topic.lastReplyEpoch) {
      activityTitle += '\nLast reply on ' + dateTimeFix(topic.lastReplyEpoch);
    }
    if (topic.bumpedEpoch && topic.bumpedEpoch !== topic.lastReplyEpoch) {
      activityTitle += '\nEdited on ' + dateTimeFix(topic.bumpedEpoch);
    }

    var anyPinIconClass = topic.pinWhere ? 'icon-pin' : undefined;
    var showExcerpt = topic.pinWhere === PinPageWhere.Globally ||
        (topic.pinWhere && topic.categoryId === this.props.activeCategory.id);
    var excerptIfPinned = showExcerpt
        ? r.p({ className: 'dw-p-excerpt' }, topic.excerpt, r.a({ href: topic.url }, 'read more'))
        : null;

    var categoryName = !category ? null :
      r.a({ onClick: () => this.switchCategory(category) }, category.name);

    var activityAgo = prettyLetterTimeAgo(topic.bumpedEpoch || topic.createdEpoch);

    // Avatars: Original Poster, some frequent posters, most recent poster. [7UKPF26]
    var userAvatars = [
        avatar.Avatar({ key: 'OP', tiny: true, user: topic.author, title: "created the topic" })];
    for (var i = 0; i < topic.frequentPosters.length; ++i) {
      var poster = topic.frequentPosters[i];
      userAvatars.push(avatar.Avatar({ key: poster.id, tiny: true, user: poster,
            title: "frequent poster" }));
    }
    if (topic.lastReplyer) {
      userAvatars.push(avatar.Avatar({ key: 'MR', tiny: true, user: topic.lastReplyer,
            title: "most recent poster" }));
    }

    return (
      r.tr({ className: 'esForum_topics_topic' },
        r.td({ className: 'dw-tpc-title' },
          makeTitle(topic, anyPinIconClass),
          excerptIfPinned),
        r.td({}, categoryName),
        r.td({}, userAvatars),
        r.td({ className: 'num dw-tpc-replies' }, topic.numPosts - 1),
        r.td({ className: 'num dw-tpc-activity', title: activityTitle }, activityAgo)));
        // skip for now:  r.td({ className: 'num dw-tpc-feelings' }, feelings)));  [8PKY25]
  }
});



var ForumCategoriesComponent = React.createClass(<any> {
  getInitialState: function() {
    return {};
  },

  componentDidMount: function() {
    this.loadCategories(this.props);
  },

  componentWillUnmount: function(nextProps) {
    this.ignoreServerResponse = true;
  },

  componentWillReceiveProps: function(nextProps) {
    this.loadCategories(nextProps);
  },

  componentDidUpdate: function() {
    processTimeAgo();
  },

  loadCategories: function(props) {
    debiki2.Server.loadForumCategoriesTopics(this.props.pageId, props.location.query.filter,
        (categories: Category[]) => {
      if (this.ignoreServerResponse) return;
      this.setState({ categories: categories });
    });
  },

  render: function() {
    if (!this.state.categories)
      return r.p({}, 'Loading...');

    var categoryRows = this.state.categories.map((category: Category) => {
      return CategoryRow({ store: this.props.store, location: this.props.location,
          category: category, key: category.id });
    });

    var recentTopicsColumnTitle;
    switch (this.props.location.query.filter) {
      case FilterShowWaiting:
        recentTopicsColumnTitle = "Recent topics (those waiting)";
        break;
      case FilterShowDeleted:
        recentTopicsColumnTitle = "Recent topics (including deleted)";
        break;
      default:
        recentTopicsColumnTitle = "Recent topics (no filter)";
    }

    return (
      r.table({ className: 'forum-table table' },
        r.thead({},
          r.tr({},
            r.th({}, 'Category'),
            r.th({}, recentTopicsColumnTitle))),
        r.tbody({},
          categoryRows)));
    }
});



var CategoryRow = createComponent({
  componentDidMount: function() {
    var store: Store = this.props.store;
    // If this is a newly created category, scroll it into view.
    if (this.props.category.slug === store.newCategorySlug) {
      utils.scrollIntoViewInPageColumn(ReactDOM.findDOMNode(this));
    }
  },

  render: function() {
    var store: Store = this.props.store;
    var category: Category = this.props.category;
    var recentTopicRows = category.recentTopics.map((topic: Topic) => {
      var pinIconClass = topic.pinWhere ? ' icon-pin' : '';
      var numReplies = topic.numPosts - 1;
      return (
        r.tr({ key: topic.pageId },
          r.td({},
            makeTitle(topic, 'topic-title' + pinIconClass),
            r.span({ className: 'topic-details' },
              r.span({ title: numReplies + " replies" },
                numReplies, r.span({ className: 'icon-comment-empty' })),
              prettyLetterTimeAgo(topic.bumpedEpoch || topic.createdEpoch)))));
    });

    var description = category.isTheUncategorizedCategory
        ? null
        : r.p({ className: 'forum-description' }, category.description);

    // This will briefly highlight a newly created category.
    var isNewClass = this.props.category.slug === store.newCategorySlug ?
      ' esForum_cats_cat-new' : '';

    return (
      r.tr({ className: 'esForum_cats_cat' + isNewClass },
        r.td({ className: 'forum-info' }, // [rename] to esForum_cats_cat_meta
          r.div({ className: 'forum-title-wrap' },
            Link({ to: store.pagePath.value + RoutePathLatest + '/' + this.props.category.slug,
                query: this.props.location.query, className: 'forum-title' },
              category.name)),
          description),
        r.td({},  // class to esForum_cats_cat_topics?
          r.table({ className: 'topic-table-excerpt table table-condensed' },
            r.tbody({},
              recentTopicRows)))));
    }
});



function makeTitle(topic: Topic, className: string) {
  var title = topic.title;
  var iconClass = '';
  var tooltip;
  if (topic.closedAtMs && !isDone(topic) && !isAnswered(topic)) {
    tooltip = page.makePageClosedTooltipText(topic.pageRole);
    var closedIcon = r.span({ className: 'icon-block' });
    title = r.span({}, closedIcon, title);
  }
  else if (topic.pageRole === PageRole.Question) {
    tooltip = page.makeQuestionTooltipText(topic.answeredAtMs);
    var questionIconClass = topic.answeredAtMs ? 'icon-ok' : 'icon-help-circled';
    var questionIcon = r.span({ className: questionIconClass });
    var answerIcon;
    var answerCount;
    // (Don't show answer count if question already solved — too much clutter.)
    if (!topic.answeredAtMs && topic.numOrigPostReplies > 0) {
      /* Skip this answer count stuff for now (or permanently?), too much clutter.
      answerIcon = r.span({ className: 'icon-info-circled dw-icon-inverted' }, ' ');
      answerCount = r.span({ className: 'dw-qa-ans-count' }, topic.numOrigPostReplies);
      */
      tooltip += " with " + topic.numOrigPostReplies;
      if (topic.numOrigPostReplies > 1) tooltip += " answers";
      else tooltip += " answer";
    }
    title = r.span({}, questionIcon, answerCount, answerIcon, title);
  }
  else if (topic.pageRole === PageRole.Problem || topic.pageRole === PageRole.Idea) {
    // (Some dupl code, see [5KEFEW2] in discussion.ts.
    if (!topic.plannedAtMs) {
      tooltip = topic.pageRole === PageRole.Problem
          ? "This is an unsolved problem"
          : "This is an idea";
      iconClass = topic.pageRole === PageRole.Problem ? 'icon-attention-circled' : 'icon-idea';
    }
    else if (!topic.doneAtMs) {
      tooltip = topic.pageRole === PageRole.Problem
          ? "We're planning to fix this"
          : "We're planning to do this";
      iconClass = 'icon-check-empty';
    }
    else {
      tooltip = topic.pageRole === PageRole.Problem
          ? "This has been fixed"
          : "This has been done";
      iconClass = 'icon-check';
    }
    title = r.span({}, r.span({ className: iconClass }, title));
  }
  else if (topic.pageRole === PageRole.ToDo) {
    iconClass = topic.doneAtMs ? 'icon-check' : 'icon-check-empty';
    tooltip = topic.doneAtMs
        ? "This has been done or fixed"
        : "This is something to do or to fix";
    title = r.span({}, r.span({ className: iconClass }, title));
  }
  else if (topic.pageRole === PageRole.OpenChat) {
    tooltip = "This is a chat channel";
    title = r.span({}, r.span({ className: 'icon-chat' }), title);
  }
  else if (topic.pageRole === PageRole.PrivateChat) {
    tooltip = "This is a private chat channel";
    title = r.span({}, r.span({ className: 'icon-lock' }), title);
  }
  else if (topic.pageRole === PageRole.MindMap) {
    tooltip = "This is a mind map";
    title = r.span({}, r.span({ className: 'icon-sitemap' }), title);
  }
  else {
    title = r.span({}, r.span({ className: 'icon-comment-empty' }), title);
    tooltip = "A discussion";
  }
  if (topic.deletedAtMs) {
    title = r.span({ className: 'esForum_topics_topic-deleted' },
        r.span({ className: 'icon-trash' }), title);
  }

  if (topic.pinWhere) {
    tooltip += topic.pinWhere == PinPageWhere.Globally
      ? "\nIt has been pinned, so it's listed first."
      : "\nIt has been pinned in its category, so is listed first, in its category.";
  }

  // COULD remove the HTML for the topic type icon, if topic pinned — because showing both
  // the pin icon, + topic type icon, looks ugly. But for now, just hide the topic type
  // icon in CSS instead: [6YK320W].
  return (
      r.a({ href: topic.url, title: tooltip, className: className }, title));
}


function createTopicBtnTitle(category: Category) {
  var title = "Create Topic";
  if (_.isEqual([PageRole.Idea], category.newTopicTypes)) {
    title = "Post an Idea";
  }
  else if (_.isEqual([PageRole.Question], category.newTopicTypes)) {
    title = "Ask a Question";
  }
  else if (_.isEqual([PageRole.Problem], category.newTopicTypes)) {
    title = "Report a Problem";
  }
  else if (_.isEqual([PageRole.Critique], category.newTopicTypes)) {
    title = "Ask for Critique"; // [plugin]
  }
  else if (areWebPages(category.newTopicTypes)) {
    title = "Create Page";
  }
  function areWebPages(topicTypes: PageRole[]): boolean {
    return isWebPage(topicTypes[0]) && (
        topicTypes.length === 1 || (topicTypes.length === 2 && isWebPage(topicTypes[1])));
  }
  function isWebPage(pageType: PageRole): boolean {
    return pageType === PageRole.CustomHtmlPage || pageType === PageRole.WebPage;
  }
  return title;
}


// Some dupl code, see  [4KEPW2].
function isDone(topic: Topic): boolean {
  return topic.doneAtMs && (topic.pageRole === PageRole.Problem ||
      topic.pageRole === PageRole.Idea || topic.pageRole === PageRole.ToDo);
}


// Some dupl code, see  [4KEPW2].
function isAnswered(topic: Topic): boolean {
  return topic.answeredAtMs && topic.pageRole === PageRole.Question;
}


//------------------------------------------------------------------------------
   }
//------------------------------------------------------------------------------
// vim: fdm=marker et ts=2 sw=2 tw=0 fo=r list
