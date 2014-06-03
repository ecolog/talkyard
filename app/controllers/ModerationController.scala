/**
 * Copyright (C) 2012-2013 Kaj Magnus Lindberg (born 1979)
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

package controllers

import actions.ApiActions._
import actions.PageActions._
import com.debiki.core._
import com.debiki.core.{PostActionPayload => PAP}
import com.debiki.core.Prelude._
import controllers.Utils._
import debiki._
import java.{util => ju}
import play.api._
import play.api.libs.json._
import play.api.libs.json.Json.toJson
import play.api.mvc.{Action => _, _}


/** Lists posts that require attention, e.g. because they've been flagged or edited
  * or needs to be approved. And after that, list recently modified posts.
  */
object ModerationController extends mvc.Controller {


  val ActionCountLimit = 100
  val PostTextLengthLimit = 500


  def listRecentPosts = AdminGetAction { request =>

    /*
    val fromIpOpt = pageReq.queryString.getEmptyAsNone("from-ip")
    val byIdtyOpt = pageReq.queryString.getEmptyAsNone("by-identity")
    val pathRanges = {
      import pageReq.pagePath
      if (pagePath.isFolderOrIndexPage)
        Utils.parsePathRanges(pagePath.folder, pageReq.queryString)
      else throwBadReq(
        "DwE92GK31", "Currently you cannot list actions on single pages. "+
        "Try with http://server-address/?list-actions")
    }

    val (actions, people: People) = pageReq.dao.loadRecentActionExcerpts(
      fromIp = fromIpOpt, byIdentity = byIdtyOpt, pathRanges = pathRanges,
      limit = ActionCountLimit)

    // COULD rename this function to listPosts?
    // Or:  ?list-actions&type=posts&...
    def posts = actions filter (_.isInstanceOf[Post])
      */

    val (posts, people: People) =
      request.dao.loadPostsRecentlyActive(limit = ActionCountLimit)

    val (flagsByPostId, flaggers: People) =
      request.dao.loadFlags(posts.filter(_.numPendingFlags > 0).map(_.pagePostId))

    val pageMetaByPageId = request.dao.loadPageMetasAsMap(posts.map(_.pageParts.pageId).distinct)

    OkSafeJson(toJson(Map(
      "actions" -> JsArray(posts.map(jsonForPost(
          _, pageMetaByPageId, flagsByPostId, flaggers))),
      "postTextLengthLimit" -> JsNumber(PostTextLengthLimit),
      // This limit is only approximate, if you list pages both
      // by folder path and by page id. see
      //   RdbSiteDao.loadRecentActionExcerpts(),
      // which does a `(select ... limit ...) union (select ... limit ...)`.
      "actionCountApproxLimit" -> JsNumber(ActionCountLimit))))
  }


  private def jsonForPost(action: PostAction[_], pageMetaByPageId: Map[PageId, PageMeta],
        flagsByPostId: Map[PagePostId, Seq[RawPostAction[PAP.Flag]]], flaggers: People): JsValue = {

    val pageName = pageMetaByPageId.get(action.page.id)
      .map(_.cachedTitle getOrElse "(Unnamed page)")
      .getOrElse("(Page not found)")

    var data = Map[String, JsValue](
      "id" -> JsString(action.id.toString),
      "pageId" -> JsString(action.page.id),
      "pageName" -> JsString(pageName),
      "type" -> JsString(classNameOf(action)),
      "userId" -> JsString(action.userId),
      "userDisplayName" -> JsString(action.user_!.displayName),
      "cdati" -> JsString(toIso8601T(action.creationDati)))

    action.loginId foreach { id =>
      data += "loginId" -> JsString(id)
    }

    action match {
      case post: Post =>
        post.approvedText foreach { text =>
          data += "approvedText" -> JsString(text take PostTextLengthLimit)
        }
        post.unapprovedText foreach { text =>
          data += "unapprovedText" -> JsString(text take PostTextLengthLimit)
        }

        val status =
          if (post.currentVersionPrelApproved) {
            if (post.someVersionPermanentlyApproved) "EditsPrelApproved"
            else "NewPrelApproved"
          }
          else if (post.currentVersionApproved) "Approved"
          else if (post.currentVersionRejected) {
            if (post.someVersionPermanentlyApproved) "EditsRejected"
            else "Rejected"
          }
          else if (post.someVersionPermanentlyApproved) "NewEdits"
          else "New"

        data += "status" -> JsString(status)

        if (post.numEditsToReview > 0)
          data += "numEditsToReview" -> JsNumber(post.numEditsToReview)
        if (post.numPendingEditSuggestions > 0)
          data += "numPendingEditSuggestions" -> JsNumber(post.numPendingEditSuggestions)
        if (post.numFlags > 0) {
          data += "numPendingFlags" -> JsNumber(post.numPendingFlags)
          data += "numHandledFlags" -> JsNumber(post.numHandledFlags)
        }

        if (post.numPendingFlags > 0) {
          val flags = flagsByPostId.get(post.pagePostId) getOrElse Nil
          val jsFlags = flags map { flag =>
            val flaggerName =
              flaggers.user(flag.userId).map(_.displayName).getOrElse("(Deleted user?)")
            Json.obj(
              "flaggerId" -> flag.userId,
              "flaggerDisplayName" -> flaggerName,
              "flagType" -> flag.payload.tyype.toString,
              "flagReason" -> flag.payload.reason)
          }
          data += "pendingFlags" -> JsArray(jsFlags)
        }

      case _ =>
    }

    toJson(data)
  }

}

