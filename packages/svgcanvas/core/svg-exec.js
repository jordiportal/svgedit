/**
 * Tools for svg.
 * @module svg
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */

import { jsPDF as JsPDF } from 'jspdf'
import 'svg2pdf.js'

import * as history from './history.js'
import {
  text2xml,
  cleanupElement,
  findDefs,
  getHref,
  preventClickDefault,
  toXml,
  getStrokedBBoxDefaultVisible,
  walkTree,
  getBBox as utilsGetBBox,
  hashCode
} from './utilities.js'
import {
  transformPoint,
  transformListToTransform,
  getTransformList
} from './math.js'
import { convertUnit, shortFloat, convertToNum } from './units.js'
import { isGecko, isChrome, isWebkit } from '../common/browser.js'
import * as pathModule from './path.js'
import { NS } from './namespaces.js'
import * as draw from './draw.js'
import { recalculateDimensions } from './recalculate.js'
import { getParents, getClosest } from '../common/util.js'

const {
  InsertElementCommand,
  RemoveElementCommand,
  ChangeElementCommand,
  BatchCommand
} = history

let svgCanvas = null

/**
 * @function module:svg-exec.init
 * @param {module:svg-exec.SvgCanvas#init} svgContext
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
  svgCanvas.setSvgString = setSvgString
  svgCanvas.importSvgString = importSvgString
  svgCanvas.uniquifyElems = uniquifyElemsMethod
  svgCanvas.setUseData = setUseDataMethod
  svgCanvas.convertGradients = convertGradientsMethod
  svgCanvas.removeUnusedDefElems = removeUnusedDefElemsMethod // remove DOM elements inside the `<defs>` if they are notreferred to,
  svgCanvas.svgCanvasToString = svgCanvasToString // Main function to set up the SVG content for output.
  svgCanvas.svgToString = svgToString // Sub function ran on each SVG element to convert it to a string as desired.
  svgCanvas.embedImage = embedImage // Converts a given image file to a data URL when possibl
  svgCanvas.rasterExport = rasterExport // Generates a PNG (or JPG, BMP, WEBP) Data URL based on the current image
  svgCanvas.exportPDF = exportPDF // Generates a PDF based on the current image, then calls "exportedPDF"
  svgCanvas.exportAdvancedPDF = exportAdvancedPDF // Generates an advanced PDF with layer support using pdf-lib
}

/**
 * Main function to set up the SVG content for output.
 * @function module:svgcanvas.SvgCanvas#svgCanvasToString
 * @returns {string} The SVG image for output
 */
const svgCanvasToString = () => {
  // keep calling it until there are none to remove
  while (svgCanvas.removeUnusedDefElems() > 0) {} // eslint-disable-line no-empty

  svgCanvas.pathActions.clear(true)

  // Keep SVG-Edit comment on top
  const childNodesElems = svgCanvas.getSvgContent().childNodes
  childNodesElems.forEach((node, i) => {
    if (i && node.nodeType === 8 && node.data.includes('Created with')) {
      svgCanvas.getSvgContent().firstChild.before(node)
    }
  })

  // Move out of in-group editing mode
  if (svgCanvas.getCurrentGroup()) {
    draw.leaveContext()
    svgCanvas.selectOnly([svgCanvas.getCurrentGroup()])
  }

  const nakedSvgs = []

  // Unwrap gsvg if it has no special attributes (only id and style)
  const gsvgElems = svgCanvas.getSvgContent().querySelectorAll('g[data-gsvg]')
  Array.prototype.forEach.call(gsvgElems, element => {
    const attrs = element.attributes
    let len = attrs.length
    for (let i = 0; i < len; i++) {
      if (attrs[i].nodeName === 'id' || attrs[i].nodeName === 'style') {
        len--
      }
    }
    // No significant attributes, so ungroup
    if (len <= 0) {
      const svg = element.firstChild
      nakedSvgs.push(svg)
      element.replaceWith(svg)
    }
  })
  const output = svgCanvas.svgToString(svgCanvas.getSvgContent(), 0)

  // Rewrap gsvg
  if (nakedSvgs.length) {
    Array.prototype.forEach.call(nakedSvgs, el => {
      svgCanvas.groupSvgElem(el)
    })
  }

  return output
}

/**
 * Sub function ran on each SVG element to convert it to a string as desired.
 * @function module:svgcanvas.SvgCanvas#svgToString
 * @param {Element} elem - The SVG element to convert
 * @param {Integer} indent - Number of spaces to indent this tag
 * @returns {string} The given element as an SVG tag
 */
const svgToString = (elem, indent) => {
  const curConfig = svgCanvas.getCurConfig()
  const nsMap = svgCanvas.getNsMap()
  const out = []
  const unit = curConfig.baseUnit
  const unitRe = new RegExp('^-?[\\d\\.]+' + unit + '$')

  if (elem) {
    cleanupElement(elem)
    const attrs = [...elem.attributes]
    const childs = elem.childNodes
    attrs.sort((a, b) => {
      return a.name > b.name ? -1 : 1
    })

    for (let i = 0; i < indent; i++) {
      out.push(' ')
    }
    out.push('<')
    out.push(elem.localName)
    if (elem.id === 'svgcontent') {
      // Process root element separately
      const res = svgCanvas.getResolution()

      let vb = ''
      // TODO: Allow this by dividing all values by current baseVal
      // Note that this also means we should properly deal with this on import
      // if (curConfig.baseUnit !== 'px') {
      //   const unit = curConfig.baseUnit;
      //   const unitM = getTypeMap()[unit];
      //   res.w = shortFloat(res.w / unitM);
      //   res.h = shortFloat(res.h / unitM);
      //   vb = ' viewBox="' + [0, 0, res.w, res.h].join(' ') + '"';
      //   res.w += unit;
      //   res.h += unit;
      // }
      if (curConfig.dynamicOutput) {
        vb = elem.getAttribute('viewBox')
        out.push(' viewBox="' + vb + '" xmlns="' + NS.SVG + '"')
      } else {
        if (unit !== 'px') {
          res.w = convertUnit(res.w, unit) + unit
          res.h = convertUnit(res.h, unit) + unit
        }
        out.push(
          ' width="' + res.w + '" height="' + res.h + '" xmlns="' + NS.SVG + '"'
        )
      }

      const nsuris = {}

      // Check elements for namespaces, add if found
      const csElements = elem.querySelectorAll('*')
      const cElements = Array.prototype.slice.call(csElements)
      cElements.push(elem)
      Array.prototype.forEach.call(cElements, el => {
        // const el = this;
        // for some elements have no attribute
        const uri = el.namespaceURI
        if (
          uri &&
          !nsuris[uri] &&
          nsMap[uri] &&
          nsMap[uri] !== 'xmlns' &&
          nsMap[uri] !== 'xml'
        ) {
          nsuris[uri] = true
          out.push(' xmlns:' + nsMap[uri] + '="' + uri + '"')
        }
        if (el.attributes.length > 0) {
          for (const [, attr] of Object.entries(el.attributes)) {
            const u = attr.namespaceURI
            if (u && !nsuris[u] && nsMap[u] !== 'xmlns' && nsMap[u] !== 'xml') {
              nsuris[u] = true
              out.push(' xmlns:' + nsMap[u] + '="' + u + '"')
            }
          }
        }
      })

      let i = attrs.length
      const attrNames = [
        'width',
        'height',
        'xmlns',
        'x',
        'y',
        'viewBox',
        'id',
        'overflow'
      ]
      while (i--) {
        const attr = attrs[i]
        const attrVal = toXml(attr.value)

        // Namespaces have already been dealt with, so skip
        if (attr.nodeName.startsWith('xmlns:')) {
          continue
        }

        // only serialize attributes we don't use internally
        if (
          attrVal !== '' &&
          !attrNames.includes(attr.localName) &&
          (!attr.namespaceURI || nsMap[attr.namespaceURI])
        ) {
          out.push(' ')
          out.push(attr.nodeName)
          out.push('="')
          out.push(attrVal)
          out.push('"')
        }
      }
    } else {
      // Skip empty defs
      if (elem.nodeName === 'defs' && !elem.firstChild) {
        return ''
      }

      const mozAttrs = ['-moz-math-font-style', '_moz-math-font-style']
      for (let i = attrs.length - 1; i >= 0; i--) {
        const attr = attrs[i]
        let attrVal = toXml(attr.value)
        // remove bogus attributes added by Gecko
        if (mozAttrs.includes(attr.localName)) {
          continue
        }
        if (attrVal === 'null') {
          const styleName = attr.localName.replace(/-[a-z]/g, s =>
            s[1].toUpperCase()
          )
          if (Object.prototype.hasOwnProperty.call(elem.style, styleName)) {
            continue
          }
        }
        if (attrVal !== '') {
          if (attrVal.startsWith('pointer-events')) {
            continue
          }
          if (attr.localName === 'class' && attrVal.startsWith('se_')) {
            continue
          }
          out.push(' ')
          if (attr.localName === 'd') {
            attrVal = svgCanvas.pathActions.convertPath(elem, true)
          }
          if (!isNaN(attrVal)) {
            attrVal = shortFloat(attrVal)
          } else if (unitRe.test(attrVal)) {
            attrVal = shortFloat(attrVal) + unit
          }

          // Embed images when saving
          if (
            svgCanvas.getSvgOptionApply() &&
            elem.nodeName === 'image' &&
            attr.localName === 'href' &&
            svgCanvas.getSvgOptionImages() &&
            svgCanvas.getSvgOptionImages() === 'embed'
          ) {
            const img = svgCanvas.getEncodableImages(attrVal)
            if (img) {
              attrVal = img
            }
          }

          // map various namespaces to our fixed namespace prefixes
          // (the default xmlns attribute itself does not get a prefix)
          if (
            !attr.namespaceURI ||
            attr.namespaceURI === NS.SVG ||
            nsMap[attr.namespaceURI]
          ) {
            out.push(attr.nodeName)
            out.push('="')
            out.push(attrVal)
            out.push('"')
          }
        }
      }
    }

    if (elem.hasChildNodes()) {
      out.push('>')
      indent++
      let bOneLine = false

      for (let i = 0; i < childs.length; i++) {
        const child = childs.item(i)
        switch (child.nodeType) {
          case 1: // element node
            out.push('\n')
            out.push(svgCanvas.svgToString(child, indent))
            break
          case 3: {
            // text node
            const str = child.nodeValue.replace(/^\s+|\s+$/g, '')
            if (str !== '') {
              bOneLine = true
              out.push(String(toXml(str)))
            }
            break
          }
          case 4: // cdata node
            out.push('\n')
            out.push(new Array(indent + 1).join(' '))
            out.push('<![CDATA[')
            out.push(child.nodeValue)
            out.push(']]>')
            break
          case 8: // comment
            out.push('\n')
            out.push(new Array(indent + 1).join(' '))
            out.push('<!--')
            out.push(child.data)
            out.push('-->')
            break
        } // switch on node type
      }
      indent--
      if (!bOneLine) {
        out.push('\n')
        for (let i = 0; i < indent; i++) {
          out.push(' ')
        }
      }
      out.push('</')
      out.push(elem.localName)
      out.push('>')
    } else {
      out.push('/>')
    }
  }
  return out.join('')
} // end svgToString()

/**
 * This function sets the current drawing as the input SVG XML.
 * @function module:svgcanvas.SvgCanvas#setSvgString
 * @param {string} xmlString - The SVG as XML text.
 * @param {boolean} [preventUndo=false] - Indicates if we want to do the
 * changes without adding them to the undo stack - e.g. for initializing a
 * drawing on page load.
 * @fires module:svgcanvas.SvgCanvas#event:setnonce
 * @fires module:svgcanvas.SvgCanvas#event:unsetnonce
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {boolean} This function returns `false` if the set was
 *     unsuccessful, `true` otherwise.
 */
const setSvgString = (xmlString, preventUndo) => {
  const curConfig = svgCanvas.getCurConfig()
  const dataStorage = svgCanvas.getDataStorage()
  try {
    // convert string into XML document
    const newDoc = text2xml(xmlString)
    if (
      newDoc.firstElementChild &&
      newDoc.firstElementChild.namespaceURI !== NS.SVG
    ) {
      return false
    }

    svgCanvas.prepareSvg(newDoc)

    const batchCmd = new BatchCommand('Change Source')

    // remove old svg document
    const { nextSibling } = svgCanvas.getSvgContent()

    svgCanvas.getSvgContent().remove()
    const oldzoom = svgCanvas.getSvgContent()
    batchCmd.addSubCommand(
      new RemoveElementCommand(oldzoom, nextSibling, svgCanvas.getSvgRoot())
    )

    // set new svg document
    // If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
    if (svgCanvas.getDOMDocument().adoptNode) {
      svgCanvas.setSvgContent(
        svgCanvas.getDOMDocument().adoptNode(newDoc.documentElement)
      )
    } else {
      svgCanvas.setSvgContent(
        svgCanvas.getDOMDocument().importNode(newDoc.documentElement, true)
      )
    }

    svgCanvas.getSvgRoot().append(svgCanvas.getSvgContent())
    const content = svgCanvas.getSvgContent()

    svgCanvas.current_drawing_ = new draw.Drawing(
      svgCanvas.getSvgContent(),
      svgCanvas.getIdPrefix()
    )

    // retrieve or set the nonce
    const nonce = svgCanvas.getCurrentDrawing().getNonce()
    if (nonce) {
      svgCanvas.call('setnonce', nonce)
    } else {
      svgCanvas.call('unsetnonce')
    }

    // change image href vals if possible
    const elements = content.querySelectorAll('image')
    Array.prototype.forEach.call(elements, image => {
      preventClickDefault(image)
      const val = svgCanvas.getHref(image)
      if (val) {
        if (val.startsWith('data:')) {
          // Check if an SVG-edit data URI
          const m = val.match(/svgedit_url=(.*?);/)
          // const m = val.match(/svgedit_url=(?<url>.*?);/);
          if (m) {
            const url = decodeURIComponent(m[1])
            // const url = decodeURIComponent(m.groups.url);
            const iimg = new Image()
            iimg.addEventListener('load', () => {
              image.setAttributeNS(NS.XLINK, 'xlink:href', url)
            })
            iimg.src = url
          }
        }
        // Add to encodableImages if it loads
        svgCanvas.embedImage(val)
      }
    })
    // Duplicate id replace changes
    const nodes = content.querySelectorAll('[id]')
    const ids = {}
    const totalNodes = nodes.length

    for (let i = 0; i < totalNodes; i++) {
      const currentId = nodes[i].id ? nodes[i].id : 'undefined'
      if (isNaN(ids[currentId])) {
        ids[currentId] = 0
      }
      ids[currentId]++
    }

    Object.entries(ids).forEach(([key, value]) => {
      if (value > 1) {
        const nodes = content.querySelectorAll('[id="' + key + '"]')
        for (let i = 1; i < nodes.length; i++) {
          nodes[i].setAttribute('id', svgCanvas.getNextId())
        }
      }
    })

    // Wrap child SVGs in group elements
    const svgElements = content.querySelectorAll('svg')
    Array.prototype.forEach.call(svgElements, element => {
      // Skip if it's in a <defs>
      if (getClosest(element.parentNode, 'defs')) {
        return
      }

      svgCanvas.uniquifyElems(element)

      // Check if it already has a gsvg group
      const pa = element.parentNode
      if (pa.childNodes.length === 1 && pa.nodeName === 'g') {
        dataStorage.put(pa, 'gsvg', element)
        pa.id = pa.id || svgCanvas.getNextId()
      } else {
        svgCanvas.groupSvgElem(element)
      }
    })

    // For Firefox: Put all paint elems in defs
    if (isGecko()) {
      const svgDefs = findDefs()
      const findElems = content.querySelectorAll(
        'linearGradient, radialGradient, pattern'
      )
      Array.prototype.forEach.call(findElems, ele => {
        svgDefs.appendChild(ele)
      })
    }

    // Set ref element for <use> elements

    // TODO: This should also be done if the object is re-added through "redo"
    svgCanvas.setUseData(content)

    svgCanvas.convertGradients(content)

    const attrs = {
      id: 'svgcontent',
      overflow: curConfig.show_outside_canvas ? 'visible' : 'hidden'
    }

    let percs = false

    // determine proper size
    if (content.getAttribute('viewBox')) {
      const viBox = content.getAttribute('viewBox')
      const vb = viBox.split(/[ ,]+/)
      attrs.width = vb[2]
      attrs.height = vb[3]
      // handle content that doesn't have a viewBox
    } else {
      ;['width', 'height'].forEach(dim => {
        // Set to 100 if not given
        const val = content.getAttribute(dim) || '100%'
        if (String(val).substr(-1) === '%') {
          // Use user units if percentage given
          percs = true
        } else {
          attrs[dim] = convertToNum(dim, val)
        }
      })
    }

    // identify layers
    draw.identifyLayers()

    // Give ID for any visible layer children missing one
    const chiElems = content.children
    Array.prototype.forEach.call(chiElems, chiElem => {
      const visElems = chiElem.querySelectorAll(svgCanvas.getVisElems())
      Array.prototype.forEach.call(visElems, elem => {
        if (!elem.id) {
          elem.id = svgCanvas.getNextId()
        }
      })
    })

    // Percentage width/height, so let's base it on visible elements
    if (percs) {
      const bb = getStrokedBBoxDefaultVisible()
      attrs.width = bb.width + bb.x
      attrs.height = bb.height + bb.y
    }

    // Just in case negative numbers are given or
    // result from the percs calculation
    if (attrs.width <= 0) {
      attrs.width = 100
    }
    if (attrs.height <= 0) {
      attrs.height = 100
    }

    for (const [key, value] of Object.entries(attrs)) {
      content.setAttribute(key, value)
    }
    svgCanvas.contentW = attrs.width
    svgCanvas.contentH = attrs.height

    batchCmd.addSubCommand(new InsertElementCommand(svgCanvas.getSvgContent()))
    // update root to the correct size
    const width = content.getAttribute('width')
    const height = content.getAttribute('height')
    const changes = { width, height }
    batchCmd.addSubCommand(
      new ChangeElementCommand(svgCanvas.getSvgRoot(), changes)
    )

    // reset zoom
    svgCanvas.setZoom(1)

    svgCanvas.clearSelection()
    pathModule.clearData()
    svgCanvas.getSvgRoot().append(svgCanvas.selectorManager.selectorParentGroup)

    if (!preventUndo) svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('sourcechanged', [svgCanvas.getSvgContent()])
  } catch (e) {
    console.error(e)
    return false
  }

  return true
}

/**
 * This function imports the input SVG XML as a `<symbol>` in the `<defs>`, then adds a
 * `<use>` to the current layer.
 * @function module:svgcanvas.SvgCanvas#importSvgString
 * @param {string} xmlString - The SVG as XML text.
 * @param {boolean} preserveDimension - A boolean to force to preserve initial dimension of the imported svg (force svgEdit don't apply a transformation on the imported svg)
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {null|Element} This function returns null if the import was unsuccessful, or the element otherwise.
 * @todo
 * - properly handle if namespace is introduced by imported content (must add to svgcontent
 * and update all prefixes in the imported node)
 * - properly handle recalculating dimensions, `recalculateDimensions()` doesn't handle
 * arbitrary transform lists, but makes some assumptions about how the transform list
 * was obtained
 */
const importSvgString = (xmlString, preserveDimension) => {
  const dataStorage = svgCanvas.getDataStorage()
  let j
  let ts
  let useEl
  try {
    // Get unique ID
    const uid = hashCode(xmlString)

    let useExisting = false
    // Look for symbol and make sure symbol exists in image
    if (svgCanvas.getImportIds(uid) && svgCanvas.getImportIds(uid).symbol) {
      const parents = getParents(svgCanvas.getImportIds(uid).symbol, '#svgroot')
      if (parents?.length) {
        useExisting = true
      }
    }

    const batchCmd = new BatchCommand('Import Image')
    let symbol
    if (useExisting) {
      symbol = svgCanvas.getImportIds(uid).symbol
      ts = svgCanvas.getImportIds(uid).xform
    } else {
      // convert string into XML document
      const newDoc = text2xml(xmlString)

      svgCanvas.prepareSvg(newDoc)

      // import new svg document into our document
      // If DOM3 adoptNode() available, use it. Otherwise fall back to DOM2 importNode()
      const svg = svgCanvas.getDOMDocument().adoptNode
        ? svgCanvas.getDOMDocument().adoptNode(newDoc.documentElement)
        : svgCanvas.getDOMDocument().importNode(newDoc.documentElement, true)

      svgCanvas.uniquifyElems(svg)

      const innerw = convertToNum('width', svg.getAttribute('width'))
      const innerh = convertToNum('height', svg.getAttribute('height'))
      const innervb = svg.getAttribute('viewBox')
      // if no explicit viewbox, create one out of the width and height
      const vb = innervb ? innervb.split(/[ ,]+/) : [0, 0, innerw, innerh]
      for (j = 0; j < 4; ++j) {
        vb[j] = Number(vb[j])
      }

      // TODO: properly handle preserveAspectRatio
      const // canvasw = +svgContent.getAttribute('width'),
        canvash = Number(svgCanvas.getSvgContent().getAttribute('height'))
      // imported content should be 1/3 of the canvas on its largest dimension

      ts =
        innerh > innerw
          ? 'scale(' + canvash / 3 / vb[3] + ')'
          : 'scale(' + canvash / 3 / vb[2] + ')'

      // Hack to make recalculateDimensions understand how to scale
      ts = 'translate(0) ' + ts + ' translate(0)'

      symbol = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'symbol')
      const defs = findDefs()

      if (isGecko()) {
        // Move all gradients into root for Firefox, workaround for this bug:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=353575
        // TODO: Make this properly undo-able.
        const elements = svg.querySelectorAll(
          'linearGradient, radialGradient, pattern'
        )
        Array.prototype.forEach.call(elements, el => {
          defs.appendChild(el)
        })
      }

      while (svg.firstChild) {
        const first = svg.firstChild
        symbol.append(first)
      }
      const attrs = svg.attributes
      for (const attr of attrs) {
        // Ok for `NamedNodeMap`
        symbol.setAttribute(attr.nodeName, attr.value)
      }
      symbol.id = svgCanvas.getNextId()

      // Store data
      svgCanvas.setImportIds(uid, {
        symbol,
        xform: ts
      })

      findDefs().append(symbol)
      batchCmd.addSubCommand(new InsertElementCommand(symbol))
    }

    useEl = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'use')
    useEl.id = svgCanvas.getNextId()
    svgCanvas.setHref(useEl, '#' + symbol.id)
    ;(
      svgCanvas.getCurrentGroup() ||
      svgCanvas.getCurrentDrawing().getCurrentLayer()
    ).append(useEl)
    batchCmd.addSubCommand(new InsertElementCommand(useEl))
    svgCanvas.clearSelection()

    if (!preserveDimension) {
      useEl.setAttribute('transform', ts)
      recalculateDimensions(useEl)
    }
    dataStorage.put(useEl, 'symbol', symbol)
    dataStorage.put(useEl, 'ref', symbol)
    svgCanvas.addToSelection([useEl])

    // TODO: Find way to add this in a recalculateDimensions-parsable way
    // if (vb[0] !== 0 || vb[1] !== 0) {
    //   ts = 'translate(' + (-vb[0]) + ',' + (-vb[1]) + ') ' + ts;
    // }
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', [svgCanvas.getSvgContent()])
  } catch (e) {
    console.error(e)
    return null
  }

  // we want to return the element so we can automatically select it
  return useEl
}
/**
 * Function to run when image data is found.
 * @callback module:svgcanvas.ImageEmbeddedCallback
 * @param {string|false} result Data URL
 * @returns {void}
 */
/**
 * Converts a given image file to a data URL when possible, then runs a given callback.
 * @function module:svgcanvas.SvgCanvas#embedImage
 * @param {string} src - The path/URL of the image
 * @returns {Promise<string|false>} Resolves to a Data URL (string|false)
 */
const embedImage = src => {
  // Todo: Remove this Promise in favor of making an async/await `Image.load` utility
  return new Promise((resolve, reject) => {
    // load in the image and once it's loaded, get the dimensions
    const imgI = new Image()
    imgI.addEventListener('load', e => {
      // create a canvas the same size as the raster image
      const cvs = document.createElement('canvas')
      cvs.width = e.currentTarget.width
      cvs.height = e.currentTarget.height
      // load the raster image into the canvas
      cvs.getContext('2d').drawImage(e.currentTarget, 0, 0)
      // retrieve the data: URL
      try {
        let urldata = ';svgedit_url=' + encodeURIComponent(src)
        urldata = cvs.toDataURL().replace(';base64', urldata + ';base64')
        svgCanvas.setEncodableImages(src, urldata)
      } catch (e) {
        svgCanvas.setEncodableImages(src, false)
      }
      svgCanvas.setGoodImage(src)
      resolve(svgCanvas.getEncodableImages(src))
    })
    imgI.addEventListener('error', e => {
      reject(
        new Error(
          `error loading image: ${e.currentTarget.attributes.src.value}`
        )
      )
    })
    imgI.setAttribute('src', src)
  })
}

/**
 * @typedef {PlainObject} module:svgcanvas.IssuesAndCodes
 * @property {string[]} issueCodes The locale-independent code names
 * @property {string[]} issues The localized descriptions
 */

/**
 * Codes only is useful for locale-independent detection.
 * @returns {module:svgcanvas.IssuesAndCodes}
 */
const getIssues = () => {
  const uiStrings = svgCanvas.getUIStrings()
  // remove the selected outline before serializing
  svgCanvas.clearSelection()

  // Check for known CanVG issues
  const issues = []
  const issueCodes = []

  // Selector and notice
  const issueList = {
    feGaussianBlur: uiStrings.NoBlur,
    foreignObject: uiStrings.NoforeignObject,
    '[stroke-dasharray]': uiStrings.NoDashArray
  }
  const content = svgCanvas.getSvgContent()

  // Add font/text check if Canvas Text API is not implemented
  if (!('font' in document.querySelector('CANVAS').getContext('2d'))) {
    issueList.text = uiStrings.NoText
  }

  for (const [sel, descr] of Object.entries(issueList)) {
    if (content.querySelectorAll(sel).length) {
      issueCodes.push(sel)
      issues.push(descr)
    }
  }
  return { issues, issueCodes }
}
/**
 * @typedef {PlainObject} module:svgcanvas.ImageedResults
 * @property {string} datauri Contents as a Data URL
 * @property {string} bloburl May be the empty string
 * @property {string} svg The SVG contents as a string
 * @property {string[]} issues The localization messages of `issueCodes`
 * @property {module:svgcanvas.IssueCode[]} issueCodes CanVG issues found with the SVG
 * @property {"PNG"|"JPEG"|"BMP"|"WEBP"|"ICO"} type The chosen image type
 * @property {"image/png"|"image/jpeg"|"image/bmp"|"image/webp"} mimeType The image MIME type
 * @property {Float} quality A decimal between 0 and 1 (for use with JPEG or WEBP)
 * @property {string} WindowName A convenience for passing along a `window.name` to target a window on which the  could be added
 */

/**
 * Utility function to convert all external image links in an SVG element to Base64 data URLs.
 * @param {SVGElement} svgElement - The SVG element to process.
 * @returns {Promise<void>}
 */
const convertImagesToBase64 = async svgElement => {
  const imageElements = svgElement.querySelectorAll('image')
  const promises = Array.from(imageElements).map(async img => {
    const href = img.getAttribute('xlink:href') || img.getAttribute('href')
    if (href && !href.startsWith('data:')) {
      try {
        const response = await fetch(href)
        const blob = await response.blob()
        const reader = new FileReader()
        return new Promise(resolve => {
          reader.onload = () => {
            img.setAttribute('xlink:href', reader.result)
            resolve()
          }
          reader.readAsDataURL(blob)
        })
      } catch (error) {
        console.error('Failed to fetch image:', error)
      }
    }
  })
  await Promise.all(promises)
}

/**
 * Generates a raster image (PNG, JPEG, etc.) from the SVG content.
 * @param {string} [imgType='PNG'] - The image type to generate.
 * @param {number} [quality=1.0] - The image quality (for JPEG).
 * @param {string} [windowName='Exported Image'] - The window name.
 * @param {Object} [opts={}] - Additional options.
 * @returns {Promise<Object>} Resolves to an object containing export data.
 */
const rasterExport = (
  imgType = 'PNG',
  quality = 1.0,
  windowName = 'Exported Image',
  opts = {}
) => {
  return new Promise((resolve, reject) => {
    const type = imgType === 'ICO' ? 'BMP' : imgType
    const mimeType = `image/${type.toLowerCase()}`
    const { issues, issueCodes } = getIssues()
    const svgElement = svgCanvas.getSvgContent()

    const svgClone = svgElement.cloneNode(true)

    convertImagesToBase64(svgClone)
      .then(() => {
        const svgData = new XMLSerializer().serializeToString(svgClone)
        const svgBlob = new Blob([svgData], {
          type: 'image/svg+xml;charset=utf-8'
        })
        const url = URL.createObjectURL(svgBlob)

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        const width = svgElement.clientWidth || svgElement.getAttribute('width')
        const height =
          svgElement.clientHeight || svgElement.getAttribute('height')
        canvas.width = width
        canvas.height = height

        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height)
          URL.revokeObjectURL(url)

          const datauri = canvas.toDataURL(mimeType, quality)
          let blobUrl

          const onExportComplete = blobUrl => {
            const exportObj = {
              datauri,
              bloburl: blobUrl,
              svg: svgData,
              issues,
              issueCodes,
              type: imgType,
              mimeType,
              quality,
              windowName
            }
            if (!opts.avoidEvent) {
              svgCanvas.call('exported', exportObj)
            }
            resolve(exportObj)
          }

          canvas.toBlob(
            blob => {
              blobUrl = URL.createObjectURL(blob)
              onExportComplete(blobUrl)
            },
            mimeType,
            quality
          )
        }

        img.onerror = err => {
          console.error('Failed to load SVG into image element:', err)
          reject(err)
        }

        img.src = url
      })
      .catch(reject)
  })
}

/**
 * Exports the SVG content as a PDF.
 * @param {string} [windowName='svg.pdf'] - The window name or file name.
 * @param {string} [outputType='save'|'dataurlstring'] - The output type for jsPDF.
 * @returns {Promise<Object>} Resolves to an object containing PDF export data.
 */
const exportPDF = (
  windowName = 'svg.pdf',
  outputType = isChrome() ? 'save' : 'dataurlstring'
) => {
  return new Promise((resolve, reject) => {
    const res = svgCanvas.getResolution()
    const orientation = res.w > res.h ? 'landscape' : 'portrait'
    const unit = 'pt'
    const svgElement = svgCanvas.getSvgContent().cloneNode(true)

    convertImagesToBase64(svgElement)
      .then(() => {
        const svgData = new XMLSerializer().serializeToString(svgElement)
        const svgBlob = new Blob([svgData], {
          type: 'image/svg+xml;charset=utf-8'
        })
        const url = URL.createObjectURL(svgBlob)

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = res.w
        canvas.height = res.h

        const img = new Image()
        img.onload = () => {
          ctx.drawImage(img, 0, 0, res.w, res.h)
          URL.revokeObjectURL(url)

          const imgData = canvas.toDataURL('image/png')
          const doc = new JsPDF({ orientation, unit, format: [res.w, res.h] })

          const docTitle = svgCanvas.getDocumentTitle()
          doc.setProperties({ title: docTitle })
          doc.addImage(imgData, 'PNG', 0, 0, res.w, res.h)

          const { issues, issueCodes } = getIssues()
          const obj = { issues, issueCodes, windowName, outputType }

          obj.output = doc.output(
            outputType,
            outputType === 'save' ? windowName : undefined
          )

          svgCanvas.call('exportedPDF', obj)
          resolve(obj)
        }

        img.onerror = err => {
          console.error('Failed to load SVG into image element:', err)
          reject(err)
        }

        img.src = url
      })
      .catch(reject)
  })
}

/**
 * Exports the SVG content as an advanced PDF with layer support using pdf-lib.
 * @param {string} [windowName='svg.pdf'] - The window name or file name.
 * @param {string} [outputType='save'|'dataurlstring'] - The output type.
 * @param {Object} [options={}] - Advanced export options.
 * @param {boolean} [options.preserveLayers=true] - Whether to preserve layer structure.
 * @param {boolean} [options.embedFonts=false] - Whether to embed custom fonts.
 * @param {string} [options.vectorMode='hybrid'] - Vector rendering mode: 'pure', 'hybrid', or 'raster'.
 * @returns {Promise<Object>} Resolves to an object containing advanced PDF export data.
 */
const exportAdvancedPDF = async (
  windowName = 'svg-advanced.pdf',
  outputType = 'save',
  options = {}
) => {
  const {
    preserveLayers = true,
    embedFonts = false,
    vectorMode = 'hybrid'
  } = options

  try {
    // Importación dinámica de pdf-lib
    const pdfLibModule = await import('pdf-lib')
    const { PDFDocument, rgb, StandardFonts } = pdfLibModule
    
    const res = svgCanvas.getResolution()
    const svgElement = svgCanvas.getSvgContent().cloneNode(true)

    // Crear nuevo documento PDF
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([res.w, res.h])

    // Configurar metadatos
    const docTitle = svgCanvas.getDocumentTitle() || 'SVG Document'
    pdfDoc.setTitle(docTitle)
    pdfDoc.setCreator('SVGEdit Advanced PDF Export')
    pdfDoc.setProducer('SVGEdit with pdf-lib')
    pdfDoc.setCreationDate(new Date())

    if (preserveLayers) {
      // Exportación con capas preservadas
      await exportWithLayers(pdfDoc, page, svgElement, res, vectorMode, embedFonts, pdfLibModule)
    } else {
      // Exportación estándar mejorada
      await exportStandardAdvanced(pdfDoc, page, svgElement, res, vectorMode, embedFonts, pdfLibModule)
    }

    // Serializar PDF
    const pdfBytes = await pdfDoc.save()
    
    const { issues, issueCodes } = getIssues()
    const obj = { 
      issues, 
      issueCodes, 
      windowName, 
      outputType,
      advanced: true,
      options: { preserveLayers, embedFonts, vectorMode }
    }

    if (outputType === 'save') {
      // Descargar automáticamente
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = windowName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      obj.output = 'downloaded'
    } else {
      // Retornar como data URI
      const base64 = btoa(String.fromCharCode(...pdfBytes))
      obj.output = `data:application/pdf;base64,${base64}`
    }

    svgCanvas.call('exportedAdvancedPDF', obj)
    return obj

  } catch (error) {
    console.error('Advanced PDF export failed:', error)
    throw error
  }
}

/**
 * Exporta con capas preservadas como OCG (Optional Content Groups)
 */
async function exportWithLayers(pdfDoc, page, svgElement, resolution, vectorMode, embedFonts, pdfLibModule) {
  const layers = getLayersFromSVG(svgElement)
  
  for (const layer of layers) {
    // Crear grupo de contenido opcional (OCG) para cada capa
    const ocg = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: 'OCG',
        Name: pdfDoc.context.obj(layer.name || 'Layer')
      })
    )
    
    // Renderizar elementos de la capa
    await renderLayerElements(pdfDoc, page, layer.elements, ocg, resolution, vectorMode, embedFonts, pdfLibModule)
  }
}

/**
 * Exportación estándar mejorada sin capas separadas
 */
async function exportStandardAdvanced(pdfDoc, page, svgElement, resolution, vectorMode, embedFonts, pdfLibModule) {
  const allElements = [...svgElement.querySelectorAll('*')]
  
  switch (vectorMode) {
    case 'pure':
      await renderSVGElementsAsVectors(pdfDoc, page, svgElement, resolution, embedFonts, pdfLibModule)
      break
    case 'hybrid':
      await renderSVGElementsHybrid(pdfDoc, page, svgElement, resolution, embedFonts, pdfLibModule)
      break
    case 'raster':
    default:
      await renderSVGElementsAsRaster(pdfDoc, page, svgElement, resolution, pdfLibModule)
      break
  }
}

/**
 * Extrae capas del SVG basándose en grupos y estructura
 */
function getLayersFromSVG(svgElement) {
  const layers = []
  const groups = svgElement.querySelectorAll('g[id*="layer"], g[data-layer]')
  
  if (groups.length === 0) {
    // Si no hay capas explícitas, crear una capa por defecto
    return [{
      name: 'Main Layer',
      elements: [...svgElement.children]
    }]
  }
  
  groups.forEach((group, index) => {
    const layerName = group.getAttribute('id') || 
                     group.getAttribute('data-layer') || 
                     `Layer ${index + 1}`
    
    layers.push({
      name: layerName,
      elements: [...group.children]
    })
  })
  
  return layers
}

/**
 * Renderiza elementos de una capa específica
 */
async function renderLayerElements(pdfDoc, page, elements, ocg, resolution, vectorMode, embedFonts, pdfLibModule) {
  for (const element of elements) {
    await renderSVGElement(pdfDoc, page, element, resolution, vectorMode, embedFonts, pdfLibModule)
  }
}

/**
 * Renderiza elementos SVG como vectores puros
 */
async function renderSVGElementsAsVectors(pdfDoc, page, svgElement, resolution, embedFonts, pdfLibModule) {
  const elements = [...svgElement.querySelectorAll('rect, circle, ellipse, line, polyline, polygon, path, text, image')]
  
  for (const element of elements) {
    await renderSVGElement(pdfDoc, page, element, resolution, 'pure', embedFonts, pdfLibModule)
  }
}

/**
 * Renderiza elementos SVG en modo híbrido (vectores + rasterizado selectivo)
 */
async function renderSVGElementsHybrid(pdfDoc, page, svgElement, resolution, embedFonts, pdfLibModule) {
  const vectorElements = ['rect', 'circle', 'ellipse', 'line', 'text']
  const rasterElements = ['path', 'polyline', 'polygon']
  
  // Renderizar elementos simples como vectores
  const simpleElements = svgElement.querySelectorAll(vectorElements.join(','))
  for (const element of simpleElements) {
    await renderSVGElement(pdfDoc, page, element, resolution, 'pure', embedFonts, pdfLibModule)
  }
  
  // Renderizar elementos complejos como raster
  const complexElements = svgElement.querySelectorAll(rasterElements.join(','))
  if (complexElements.length > 0) {
    const tempSvg = svgElement.cloneNode(true)
    // Eliminar elementos simples del SVG temporal
    tempSvg.querySelectorAll(vectorElements.join(',')).forEach(el => el.remove())
    await renderSVGElementsAsRaster(pdfDoc, page, tempSvg, resolution, pdfLibModule)
  }
}

/**
 * Renderiza un elemento SVG individual
 */
async function renderSVGElement(pdfDoc, page, element, resolution, mode, embedFonts, pdfLibModule) {
  const tagName = element.tagName.toLowerCase()
  
  switch (tagName) {
    case 'rect':
      await renderRect(page, element, resolution, pdfLibModule)
      break
    case 'circle':
      await renderCircle(page, element, resolution, pdfLibModule)
      break
    case 'ellipse':
      await renderEllipse(page, element, resolution, pdfLibModule)
      break
    case 'line':
      await renderLine(page, element, resolution, pdfLibModule)
      break
    case 'polyline':
      await renderPolyline(page, element, resolution, pdfLibModule)
      break
    case 'polygon':
      await renderPolyline(page, element, resolution, pdfLibModule) // Usar misma lógica
      break
    case 'path':
      await renderPath(page, element, resolution, pdfLibModule)
      break
    case 'text':
      await renderText(pdfDoc, page, element, resolution, embedFonts, pdfLibModule)
      break
    case 'image':
      await renderImage(pdfDoc, page, element, resolution, pdfLibModule)
      break
    default:
      // Para elementos no soportados, renderizar como raster
      if (mode === 'pure') {
        console.warn(`Elemento ${tagName} no soportado en modo vectorial puro`)
      }
      break
  }
}

/**
 * Renderiza un rectángulo SVG
 */
async function renderRect(page, element, resolution, pdfLibModule) {
  const x = parseFloat(element.getAttribute('x') || 0)
  const y = parseFloat(element.getAttribute('y') || 0)
  const width = parseFloat(element.getAttribute('width') || 0)
  const height = parseFloat(element.getAttribute('height') || 0)
  const fill = element.getAttribute('fill')
  const stroke = element.getAttribute('stroke')
  const strokeWidth = parseFloat(element.getAttribute('stroke-width') || 1)
  
  if (width <= 0 || height <= 0) return
  
  const fillColor = parseSVGColor(fill, pdfLibModule)
  const strokeColor = parseSVGColor(stroke, pdfLibModule)
  
  // Convertir coordenadas SVG a PDF (origen en esquina inferior izquierda)
  const pdfY = resolution.h - y - height
  
  if (fillColor) {
    page.drawRectangle({
      x, y: pdfY, width, height,
      color: fillColor
    })
  }
  
  if (strokeColor && strokeWidth > 0) {
    page.drawRectangle({
      x, y: pdfY, width, height,
      borderColor: strokeColor,
      borderWidth: strokeWidth
    })
  }
}

/**
 * Renderiza texto SVG
 */
async function renderText(pdfDoc, page, element, resolution, embedFonts, pdfLibModule) {
  const x = parseFloat(element.getAttribute('x') || 0)
  const y = parseFloat(element.getAttribute('y') || 0)
  const fontSize = parseFloat(element.getAttribute('font-size') || 12)
  const fill = element.getAttribute('fill') || '#000000'
  const fontFamily = element.getAttribute('font-family') || 'Arial'
  
  let text = element.textContent || ''
  
  // Para texto multilínea, concatenar tspans
  const tspans = element.querySelectorAll('tspan')
  if (tspans.length > 0) {
    text = Array.from(tspans).map(tspan => tspan.textContent).join('\n')
  }
  
  if (!text.trim()) return
  
  let font
  try {
    if (embedFonts) {
      // Intentar embeber fuente personalizada (requiere archivo de fuente)
      font = await pdfDoc.embedFont(pdfLibModule.StandardFonts.Helvetica) // Fallback
    } else {
      // Usar fuentes estándar
      font = await pdfDoc.embedFont(pdfLibModule.StandardFonts.Helvetica)
    }
  } catch (error) {
    font = await pdfDoc.embedFont(pdfLibModule.StandardFonts.Helvetica)
  }
  
  const fillColor = parseSVGColor(fill, pdfLibModule)
  const pdfY = resolution.h - y - fontSize // Convertir coordenadas
  
  page.drawText(text, {
    x, y: pdfY,
    size: fontSize,
    font,
    color: fillColor || pdfLibModule.rgb(0, 0, 0)
  })
}

/**
 * Parsea colores SVG a formato pdf-lib
 */
function parseSVGColor(colorStr, pdfLibModule) {
  if (!colorStr || colorStr === 'none') return null
  
  const { rgb } = pdfLibModule
  
  // Colores hexadecimales
  if (colorStr.startsWith('#')) {
    const hex = colorStr.substring(1)
    const r = parseInt(hex.substring(0, 2), 16) / 255
    const g = parseInt(hex.substring(2, 4), 16) / 255
    const b = parseInt(hex.substring(4, 6), 16) / 255
    return rgb(r, g, b)
  }
  
  // Colores RGB
  if (colorStr.startsWith('rgb')) {
    const matches = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (matches) {
      return rgb(matches[1] / 255, matches[2] / 255, matches[3] / 255)
    }
  }
  
  // Colores con nombre (básicos)
  const namedColors = {
    'black': rgb(0, 0, 0),
    'white': rgb(1, 1, 1),
    'red': rgb(1, 0, 0),
    'green': rgb(0, 1, 0),
    'blue': rgb(0, 0, 1),
    'yellow': rgb(1, 1, 0),
    'cyan': rgb(0, 1, 1),
    'magenta': rgb(1, 0, 1)
  }
  
  return namedColors[colorStr.toLowerCase()] || rgb(0, 0, 0)
}

/**
 * Renderiza SVG como imagen rasterizada de alta calidad
 */
async function renderSVGElementsAsRaster(pdfDoc, page, svgElement, resolution, pdfLibModule) {
  return new Promise((resolve, reject) => {
    try {
      // Convertir imagenes a base64 primero
      convertImagesToBase64(svgElement).then(() => {
        const svgData = new XMLSerializer().serializeToString(svgElement)
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(svgBlob)
        
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        // Usar alta resolución para mejor calidad
        const scale = 2
        canvas.width = resolution.w * scale
        canvas.height = resolution.h * scale
        ctx.scale(scale, scale)
        
        const img = new Image()
        img.onload = async () => {
          ctx.drawImage(img, 0, 0, resolution.w, resolution.h)
          URL.revokeObjectURL(url)
          
          const imageData = canvas.toDataURL('image/png', 1.0)
          const imageBytes = dataURItoUint8Array(imageData)
          
          try {
            const pdfImage = await pdfLibModule.embedPng(pdfDoc, imageBytes)
            page.drawImage(pdfImage, {
              x: 0, y: 0,
              width: resolution.w,
              height: resolution.h
            })
            resolve()
          } catch (error) {
            console.error('Error embedding image in PDF:', error)
            reject(error)
          }
        }
        
        img.onerror = reject
        img.src = url
      }).catch(reject)
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Convierte data URI a Uint8Array
 */
function dataURItoUint8Array(dataURI) {
  const byteString = atob(dataURI.split(',')[1])
  const arrayBuffer = new ArrayBuffer(byteString.length)
  const int8Array = new Uint8Array(arrayBuffer)
  for (let i = 0; i < byteString.length; i++) {
    int8Array[i] = byteString.charCodeAt(i)
  }
  return int8Array
}

// Implementaciones básicas para elementos restantes
async function renderCircle(page, element, resolution, pdfLibModule) {
  const cx = parseFloat(element.getAttribute('cx') || 0)
  const cy = parseFloat(element.getAttribute('cy') || 0)
  const r = parseFloat(element.getAttribute('r') || 0)
  const fill = element.getAttribute('fill')
  const stroke = element.getAttribute('stroke')
  
  if (r <= 0) return
  
  const fillColor = parseSVGColor(fill, pdfLibModule)
  const strokeColor = parseSVGColor(stroke, pdfLibModule)
  const pdfY = resolution.h - cy
  
  if (fillColor) {
    page.drawCircle({ x: cx, y: pdfY, size: r, color: fillColor })
  }
  if (strokeColor) {
    page.drawCircle({ x: cx, y: pdfY, size: r, borderColor: strokeColor, borderWidth: 1 })
  }
}

async function renderEllipse(page, element, resolution, pdfLibModule) {
  // Implementación simplificada como círculo por ahora
  const cx = parseFloat(element.getAttribute('cx') || 0)
  const cy = parseFloat(element.getAttribute('cy') || 0)
  const rx = parseFloat(element.getAttribute('rx') || 0)
  const ry = parseFloat(element.getAttribute('ry') || 0)
  
  // Usar el radio promedio para aproximar
  const avgRadius = (rx + ry) / 2
  const fakeCircle = element.cloneNode(true)
  fakeCircle.setAttribute('cx', cx)
  fakeCircle.setAttribute('cy', cy)
  fakeCircle.setAttribute('r', avgRadius)
  
  await renderCircle(page, fakeCircle, resolution, pdfLibModule)
}

async function renderLine(page, element, resolution, pdfLibModule) {
  // Implementación básica - pdf-lib no tiene líneas directas, usar path
  const x1 = parseFloat(element.getAttribute('x1') || 0)
  const y1 = parseFloat(element.getAttribute('y1') || 0)
  const x2 = parseFloat(element.getAttribute('x2') || 0)
  const y2 = parseFloat(element.getAttribute('y2') || 0)
  const stroke = element.getAttribute('stroke')
  
  if (!stroke || stroke === 'none') return
  
  const strokeColor = parseSVGColor(stroke, pdfLibModule)
  const pdfY1 = resolution.h - y1
  const pdfY2 = resolution.h - y2
  
  // Usar rectángulo muy delgado para simular línea
  const length = Math.sqrt((x2-x1)**2 + (y2-y1)**2)
  const angle = Math.atan2(y2-y1, x2-x1)
  
  // Esta es una implementación simplificada
  page.drawRectangle({
    x: x1, y: pdfY1,
    width: length, height: 1,
    color: strokeColor,
    rotate: { type: 'degrees', angle: angle * 180 / Math.PI }
  })
}

async function renderPolyline(page, element, resolution, pdfLibModule) {
  // Implementación simplificada - renderizar como puntos conectados
  const points = element.getAttribute('points')
  if (!points) return
  
  const coords = points.trim().split(/[\s,]+/).map(Number)
  const stroke = element.getAttribute('stroke')
  const strokeColor = parseSVGColor(stroke, pdfLibModule)
  
  if (!strokeColor || coords.length < 4) return
  
  // Conectar puntos con líneas simples
  for (let i = 0; i < coords.length - 2; i += 2) {
    const fakeLine = document.createElement('line')
    fakeLine.setAttribute('x1', coords[i])
    fakeLine.setAttribute('y1', coords[i + 1])
    fakeLine.setAttribute('x2', coords[i + 2])
    fakeLine.setAttribute('y2', coords[i + 3])
    fakeLine.setAttribute('stroke', stroke)
    
    await renderLine(page, fakeLine, resolution, pdfLibModule)
  }
}

async function renderPath(page, element, resolution, pdfLibModule) {
  // Los paths son complejos, mejor renderizar como raster
  console.log('Path elements are rendered as raster for better quality')
}

async function renderImage(pdfDoc, page, element, resolution, pdfLibModule) {
  const x = parseFloat(element.getAttribute('x') || 0)
  const y = parseFloat(element.getAttribute('y') || 0)
  const width = parseFloat(element.getAttribute('width') || 0)
  const height = parseFloat(element.getAttribute('height') || 0)
  const href = element.getAttribute('href') || element.getAttribute('xlink:href')
  
  if (!href || width <= 0 || height <= 0) return
  
  try {
    if (href.startsWith('data:')) {
      const imageBytes = dataURItoUint8Array(href)
      let pdfImage
      
      if (href.includes('image/png')) {
        pdfImage = await pdfDoc.embedPng(imageBytes)
      } else if (href.includes('image/jpeg') || href.includes('image/jpg')) {
        pdfImage = await pdfDoc.embedJpg(imageBytes)
      } else {
        console.warn('Formato de imagen no soportado:', href.substring(0, 50))
        return
      }
      
      const pdfY = resolution.h - y - height
      page.drawImage(pdfImage, {
        x, y: pdfY, width, height
      })
    }
  } catch (error) {
    console.error('Error al renderizar imagen:', error)
  }
}

/**
 * Ensure each element has a unique ID.
 * @function module:svgcanvas.SvgCanvas#uniquifyElems
 * @param {Element} g - The parent element of the tree to give unique IDs
 * @returns {void}
 */
const uniquifyElemsMethod = g => {
  const ids = {}
  // TODO: Handle markers and connectors. These are not yet re-identified properly
  // as their referring elements do not get remapped.
  //
  // <marker id='se_marker_end_svg_7'/>
  // <polyline id='svg_7' se:connector='svg_1 svg_6' marker-end='url(#se_marker_end_svg_7)'/>
  //
  // Problem #1: if svg_1 gets renamed, we do not update the polyline's se:connector attribute
  // Problem #2: if the polyline svg_7 gets renamed, we do not update the marker id nor the polyline's marker-end attribute
  const refElems = [
    'filter',
    'linearGradient',
    'pattern',
    'radialGradient',
    'symbol',
    'textPath',
    'use'
  ]

  walkTree(g, n => {
    // if it's an element node
    if (n.nodeType === 1) {
      // and the element has an ID
      if (n.id) {
        // and we haven't tracked this ID yet
        if (!(n.id in ids)) {
          // add this id to our map
          ids[n.id] = { elem: null, attrs: [], hrefs: [] }
        }
        ids[n.id].elem = n
      }

      // now search for all attributes on this element that might refer
      // to other elements
      svgCanvas.getrefAttrs().forEach(attr => {
        const attrnode = n.getAttributeNode(attr)
        if (attrnode) {
          // the incoming file has been sanitized, so we should be able to safely just strip off the leading #
          const url = svgCanvas.getUrlFromAttr(attrnode.value)
          const refid = url ? url.substr(1) : null
          if (refid) {
            if (!(refid in ids)) {
              // add this id to our map
              ids[refid] = { elem: null, attrs: [], hrefs: [] }
            }
            ids[refid].attrs.push(attrnode)
          }
        }
      })

      // check xlink:href now
      const href = svgCanvas.getHref(n)
      // TODO: what if an <image> or <a> element refers to an element internally?
      if (href && refElems.includes(n.nodeName)) {
        const refid = href.substr(1)
        if (refid) {
          if (!(refid in ids)) {
            // add this id to our map
            ids[refid] = { elem: null, attrs: [], hrefs: [] }
          }
          ids[refid].hrefs.push(n)
        }
      }
    }
  })

  // in ids, we now have a map of ids, elements and attributes, let's re-identify
  for (const oldid in ids) {
    if (!oldid) {
      continue
    }
    const { elem } = ids[oldid]
    if (elem) {
      const newid = svgCanvas.getNextId()

      // assign element its new id
      elem.id = newid

      // remap all url() attributes
      const { attrs } = ids[oldid]
      let j = attrs.length
      while (j--) {
        const attr = attrs[j]
        attr.ownerElement.setAttribute(attr.name, 'url(#' + newid + ')')
      }

      // remap all href attributes
      const hreffers = ids[oldid].hrefs
      let k = hreffers.length
      while (k--) {
        const hreffer = hreffers[k]
        svgCanvas.setHref(hreffer, '#' + newid)
      }
    }
  }
}

/**
 * Assigns reference data for each use element.
 * @function module:svgcanvas.SvgCanvas#setUseData
 * @param {Element} parent
 * @returns {void}
 */
const setUseDataMethod = parent => {
  let elems = parent

  if (parent.tagName !== 'use') {
    // elems = elems.find('use');
    elems = elems.querySelectorAll('use')
  }

  Array.prototype.forEach.call(elems, (el, _) => {
    const dataStorage = svgCanvas.getDataStorage()
    const id = svgCanvas.getHref(el).substr(1)
    const refElem = svgCanvas.getElement(id)
    if (!refElem) {
      return
    }
    dataStorage.put(el, 'ref', refElem)
    if (refElem.tagName === 'symbol' || refElem.tagName === 'svg') {
      dataStorage.put(el, 'symbol', refElem)
      dataStorage.put(el, 'ref', refElem)
    }
  })
}

/**
 * Looks at DOM elements inside the `<defs>` to see if they are referred to,
 * removes them from the DOM if they are not.
 * @function module:svgcanvas.SvgCanvas#removeUnusedDefElems
 * @returns {Integer} The number of elements that were removed
 */
const removeUnusedDefElemsMethod = () => {
  const defs = svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, 'defs')
  if (!defs || !defs.length) {
    return 0
  }

  // if (!defs.firstChild) { return; }

  const defelemUses = []
  let numRemoved = 0
  const attrs = [
    'fill',
    'stroke',
    'filter',
    'marker-start',
    'marker-mid',
    'marker-end'
  ]
  const alen = attrs.length

  const allEls = svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, '*')
  const allLen = allEls.length

  let i
  let j
  for (i = 0; i < allLen; i++) {
    const el = allEls[i]
    for (j = 0; j < alen; j++) {
      const ref = svgCanvas.getUrlFromAttr(el.getAttribute(attrs[j]))
      if (ref) {
        defelemUses.push(ref.substr(1))
      }
    }

    // gradients can refer to other gradients
    const href = getHref(el)
    if (href && href.startsWith('#')) {
      defelemUses.push(href.substr(1))
    }
  }

  Array.prototype.forEach.call(defs, (def, i) => {
    const defelems = def.querySelectorAll(
      'linearGradient, radialGradient, filter, marker, svg, symbol'
    )
    i = defelems.length
    while (i--) {
      const defelem = defelems[i]
      const { id } = defelem
      if (!defelemUses.includes(id)) {
        // Not found, so remove (but remember)
        svgCanvas.setRemovedElements(id, defelem)
        defelem.remove()
        numRemoved++
      }
    }
  })

  return numRemoved
}
/**
 * Converts gradients from userSpaceOnUse to objectBoundingBox.
 * @function module:svgcanvas.SvgCanvas#convertGradients
 * @param {Element} elem
 * @returns {void}
 */
const convertGradientsMethod = elem => {
  let elems = elem.querySelectorAll('linearGradient, radialGradient')
  if (!elems.length && isWebkit()) {
    // Bug in webkit prevents regular *Gradient selector search
    elems = Array.prototype.filter.call(elem.querySelectorAll('*'), curThis => {
      return curThis.tagName.includes('Gradient')
    })
  }
  Array.prototype.forEach.call(elems, grad => {
    if (grad.getAttribute('gradientUnits') === 'userSpaceOnUse') {
      const svgContent = svgCanvas.getSvgContent()
      // TODO: Support more than one element with this ref by duplicating parent grad
      let fillStrokeElems = svgContent.querySelectorAll(
        '[fill="url(#' + grad.id + ')"],[stroke="url(#' + grad.id + ')"]'
      )
      if (!fillStrokeElems.length) {
        const tmpFillStrokeElems = svgContent.querySelectorAll(
          '[*|href="#' + grad.id + '"]'
        )
        if (!tmpFillStrokeElems.length) {
          return
        } else {
          if (
            (tmpFillStrokeElems[0].tagName === 'linearGradient' ||
              tmpFillStrokeElems[0].tagName === 'radialGradient') &&
            tmpFillStrokeElems[0].getAttribute('gradientUnits') ===
              'userSpaceOnUse'
          ) {
            fillStrokeElems = svgContent.querySelectorAll(
              '[fill="url(#' +
                tmpFillStrokeElems[0].id +
                ')"],[stroke="url(#' +
                tmpFillStrokeElems[0].id +
                ')"]'
            )
          } else {
            return
          }
        }
      }
      // get object's bounding box
      const bb = utilsGetBBox(fillStrokeElems[0])

      // This will occur if the element is inside a <defs> or a <symbol>,
      // in which we shouldn't need to convert anyway.
      if (!bb) {
        return
      }
      if (grad.tagName === 'linearGradient') {
        const gCoords = {
          x1: grad.getAttribute('x1'),
          y1: grad.getAttribute('y1'),
          x2: grad.getAttribute('x2'),
          y2: grad.getAttribute('y2')
        }

        // If has transform, convert
        const tlist = getTransformList(grad)
        if (tlist?.numberOfItems > 0) {
          const m = transformListToTransform(tlist).matrix
          const pt1 = transformPoint(gCoords.x1, gCoords.y1, m)
          const pt2 = transformPoint(gCoords.x2, gCoords.y2, m)

          gCoords.x1 = pt1.x
          gCoords.y1 = pt1.y
          gCoords.x2 = pt2.x
          gCoords.y2 = pt2.y
          grad.removeAttribute('gradientTransform')
        }
        grad.setAttribute('x1', (gCoords.x1 - bb.x) / bb.width)
        grad.setAttribute('y1', (gCoords.y1 - bb.y) / bb.height)
        grad.setAttribute('x2', (gCoords.x2 - bb.x) / bb.width)
        grad.setAttribute('y2', (gCoords.y2 - bb.y) / bb.height)
        grad.removeAttribute('gradientUnits')
      }
    }
  })
}
