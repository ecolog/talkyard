/**
 * Copyright (C) 2013 Kaj Magnus Lindberg (born 1979)
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

import com.debiki.v0._
import java.{util => ju}
import play.api._
import ApiActions._
import Prelude._


/** Full text search, for a whole site, or for a site section, e.g. a single
  * forum (including all sub forums and topics), a single blog, or wiki.
  */
object FullTextSearch extends mvc.Controller {


  def searchWholeSite(phrase: String) = GetAction { apiReq =>
    val result = apiReq.dao.fullTextSearch(phrase, anyRootPageId = None)

    // For now:
    val html = <div>{
      for (hit <- result.hits) yield {
        <p>
          Page: {hit.post.page.id}<br/>
          Post: {hit.post.id}<br/>
          Text: <i>{hit.post.approvedText.getOrElse("")}</i><br/>
        </p>
      }
    }</div>

    Utils.OkHtmlBody(html)
  }


  def searchSiteSection(pageId: String, phrase: String) = GetAction { apiReq =>
    apiReq.dao.fullTextSearch(phrase, anyRootPageId = Some(pageId))
          unimplemented
  }

}
