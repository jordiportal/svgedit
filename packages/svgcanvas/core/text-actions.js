/**
 * @module text-actions Tools for Text edit functions
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { transformPoint, getMatrix } from './math.js'
import {
  assignAttributes,
  getElement,
  getBBox as utilsGetBBox
} from './utilities.js'
import { supportsGoodTextCharPos } from '../common/browser.js'

let svgCanvas = null

/**
 * @function module:text-actions.init
 * @param {module:text-actions.svgCanvas} textActionsContext
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
}

/**
 * Group: Text edit functions
 * Functions relating to editing text elements.
 * @namespace {PlainObject} textActions
 * @memberof module:svgcanvas.SvgCanvas#
 */
export const textActionsMethod = (function () {
  let curtext
  let textinput
  let cursor
  let selblock
  let blinker
  let chardata = []
  let textbb // , transbb;
  let matrix
  let lastX
  let lastY
  let allowDbl

  /**
   *
   * @param {Integer} index
   * @returns {void}
   */
  function setCursor (index) {
    const empty = textinput.value === ''
    textinput.focus()

    if (!arguments.length) {
      if (empty) {
        index = 0
      } else {
        if (textinput.selectionEnd !== textinput.selectionStart) {
          return
        }
        index = textinput.selectionEnd
      }
    }

    const charbb = chardata[index]
    if (!empty) {
      textinput.setSelectionRange(index, index)
    }
    cursor = getElement('text_cursor')
    if (!cursor) {
      cursor = document.createElementNS(NS.SVG, 'line')
      assignAttributes(cursor, {
        id: 'text_cursor',
        stroke: '#333',
        'stroke-width': 1
      })
      getElement('selectorParentGroup').append(cursor)
    }

    if (!blinker) {
      blinker = setInterval(function () {
        const show = cursor.getAttribute('display') === 'none'
        cursor.setAttribute('display', show ? 'inline' : 'none')
      }, 600)
    }

    const startPt = ptToScreen(charbb.x, textbb.y)
    const endPt = ptToScreen(charbb.x, textbb.y + textbb.height)

    assignAttributes(cursor, {
      x1: startPt.x,
      y1: startPt.y,
      x2: endPt.x,
      y2: endPt.y,
      visibility: 'visible',
      display: 'inline'
    })

    if (selblock) {
      selblock.setAttribute('d', '')
    }
  }

  /**
   *
   * @param {Integer} start
   * @param {Integer} end
   * @param {boolean} skipInput
   * @returns {void}
   */
  function setSelection (start, end, skipInput) {
    if (start === end) {
      setCursor(end)
      return
    }

    if (!skipInput) {
      textinput.setSelectionRange(start, end)
    }

    selblock = getElement('text_selectblock')
    if (!selblock) {
      selblock = document.createElementNS(NS.SVG, 'path')
      assignAttributes(selblock, {
        id: 'text_selectblock',
        fill: 'green',
        opacity: 0.5,
        style: 'pointer-events:none'
      })
      getElement('selectorParentGroup').append(selblock)
    }

    const startbb = chardata[start]
    const endbb = chardata[end]

    cursor.setAttribute('visibility', 'hidden')

    const tl = ptToScreen(startbb.x, textbb.y)
    const tr = ptToScreen(startbb.x + (endbb.x - startbb.x), textbb.y)
    const bl = ptToScreen(startbb.x, textbb.y + textbb.height)
    const br = ptToScreen(
      startbb.x + (endbb.x - startbb.x),
      textbb.y + textbb.height
    )

    const dstr =
      'M' +
      tl.x +
      ',' +
      tl.y +
      ' L' +
      tr.x +
      ',' +
      tr.y +
      ' ' +
      br.x +
      ',' +
      br.y +
      ' ' +
      bl.x +
      ',' +
      bl.y +
      'z'

    assignAttributes(selblock, {
      d: dstr,
      display: 'inline'
    })
  }

  /**
   *
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {Integer}
   */
  function getIndexFromPoint (mouseX, mouseY) {
    // Position cursor here
    const pt = svgCanvas.getSvgRoot().createSVGPoint()
    pt.x = mouseX
    pt.y = mouseY

    // No content, so return 0
    if (chardata.length === 1) {
      return 0
    }

    // Si es texto multilínea, no usar getCharNumAtPosition ya que no funciona con tspan
    if (curtext.getAttribute('data-multiline') === 'true') {
      // Para texto multilínea, simplemente retornamos 0 para evitar errores
      // El usuario debe usar doble clic para editar
      return 0
    }

    // Determine if cursor should be on left or right of character
    let charpos = curtext.getCharNumAtPosition(pt)
    if (charpos < 0) {
      // Out of text range, look at mouse coords
      charpos = chardata.length - 2
      if (mouseX <= chardata[0].x) {
        charpos = 0
      }
    } else if (charpos >= chardata.length - 2) {
      charpos = chardata.length - 2
    }
    const charbb = chardata[charpos]
    const mid = charbb.x + charbb.width / 2
    if (mouseX > mid) {
      charpos++
    }
    return charpos
  }

  /**
   *
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   */
  function setCursorFromPoint (mouseX, mouseY) {
    setCursor(getIndexFromPoint(mouseX, mouseY))
  }

  /**
   *
   * @param {Float} x
   * @param {Float} y
   * @param {boolean} apply
   * @returns {void}
   */
  function setEndSelectionFromPoint (x, y, apply) {
    const i1 = textinput.selectionStart
    const i2 = getIndexFromPoint(x, y)

    const start = Math.min(i1, i2)
    const end = Math.max(i1, i2)
    setSelection(start, end, !apply)
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   */
  function screenToPt (xIn, yIn) {
    const out = {
      x: xIn,
      y: yIn
    }
    const zoom = svgCanvas.getZoom()
    out.x /= zoom
    out.y /= zoom

    if (matrix) {
      const pt = transformPoint(out.x, out.y, matrix.inverse())
      out.x = pt.x
      out.y = pt.y
    }

    return out
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   */
  function ptToScreen (xIn, yIn) {
    const out = {
      x: xIn,
      y: yIn
    }

    if (matrix) {
      const pt = transformPoint(out.x, out.y, matrix)
      out.x = pt.x
      out.y = pt.y
    }
    const zoom = svgCanvas.getZoom()
    out.x *= zoom
    out.y *= zoom

    return out
  }

  /**
   *
   * @param {Event} evt
   * @returns {void}
   */
  function selectAll (evt) {
    setSelection(0, curtext.textContent.length)
    evt.target.removeEventListener('click', selectAll)
  }

  /**
   *
   * @param {Event} evt
   * @returns {void}
   */
  function selectWord (evt) {
    if (!allowDbl || !curtext) {
      return
    }
    const zoom = svgCanvas.getZoom()
    const ept = transformPoint(evt.pageX, evt.pageY, svgCanvas.getrootSctm())
    const mouseX = ept.x * zoom
    const mouseY = ept.y * zoom
    const pt = screenToPt(mouseX, mouseY)

    const index = getIndexFromPoint(pt.x, pt.y)
    const str = curtext.textContent
    const first = str.substr(0, index).replace(/[a-z\d]+$/i, '').length
    const m = str.substr(index).match(/^[a-z\d]+/i)
    const last = (m ? m[0].length : 0) + index
    setSelection(first, last)

    // Set tripleclick
    svgCanvas.$click(evt.target, selectAll)

    setTimeout(function () {
      evt.target.removeEventListener('click', selectAll)
    }, 300)
  }

  return /** @lends module:svgcanvas.SvgCanvas#textActions */ {
    /**
     * @param {Element} target
     * @param {Float} x
     * @param {Float} y
     * @returns {void}
     */
    select (target, x, y) {
      curtext = target
      svgCanvas.textActions.toEditMode(x, y)
    },
    /**
     * @param {Element} target
     * @param {Float} x
     * @param {Float} y
     * @returns {void}
     */
    selectMultiline (target, x, y) {
      curtext = target
      svgCanvas.textActions.toMultilineEditMode(x, y)
    },
    /**
     * @param {Element} elem
     * @returns {void}
     */
    start (elem) {
      curtext = elem
      svgCanvas.textActions.toEditMode()
    },
    /**
     * @param {external:MouseEvent} evt
     * @param {Element} mouseTarget
     * @param {Float} startX
     * @param {Float} startY
     * @returns {void}
     */
    mouseDown (evt, mouseTarget, startX, startY) {
      const pt = screenToPt(startX, startY)

      textinput.focus()
      setCursorFromPoint(pt.x, pt.y)
      lastX = startX
      lastY = startY

      // TODO: Find way to block native selection
    },
    /**
     * @param {Float} mouseX
     * @param {Float} mouseY
     * @returns {void}
     */
    mouseMove (mouseX, mouseY) {
      const pt = screenToPt(mouseX, mouseY)
      setEndSelectionFromPoint(pt.x, pt.y)
    },
    /**
     * @param {external:MouseEvent} evt
     * @param {Float} mouseX
     * @param {Float} mouseY
     * @returns {void}
     */
    mouseUp (evt, mouseX, mouseY) {
      const pt = screenToPt(mouseX, mouseY)

      setEndSelectionFromPoint(pt.x, pt.y, true)

      // TODO: Find a way to make this work: Use transformed BBox instead of evt.target
      // if (lastX === mouseX && lastY === mouseY
      //   && !rectsIntersect(transbb, {x: pt.x, y: pt.y, width: 0, height: 0})) {
      //   svgCanvas.textActions.toSelectMode(true);
      // }

      if (
        evt.target !== curtext &&
        mouseX < lastX + 2 &&
        mouseX > lastX - 2 &&
        mouseY < lastY + 2 &&
        mouseY > lastY - 2
      ) {
        svgCanvas.textActions.toSelectMode(true)
      }
    },
    /**
     * @function
     * @param {Integer} index
     * @returns {void}
     */
    setCursor,
    /**
     * @param {Float} x
     * @param {Float} y
     * @returns {void}
     */
    toEditMode (x, y) {
      allowDbl = false
      svgCanvas.setCurrentMode('textedit')
      svgCanvas.selectorManager.requestSelector(curtext).showGrips(false)
      // Make selector group accept clicks
      /* const selector = */ svgCanvas.selectorManager.requestSelector(curtext) // Do we need this? Has side effect of setting lock, so keeping for now, but next line wasn't being used
      // const sel = selector.selectorRect;

      svgCanvas.textActions.init()

      curtext.style.cursor = 'text'

      // if (supportsEditableText()) {
      //   curtext.setAttribute('editable', 'simple');
      //   return;
      // }

      if (!arguments.length) {
        setCursor()
      } else {
        const pt = screenToPt(x, y)
        setCursorFromPoint(pt.x, pt.y)
      }

      setTimeout(function () {
        allowDbl = true
      }, 300)
    },
    /**
     * @param {Float} x
     * @param {Float} y
     * @returns {void}
     */
    toMultilineEditMode (x, y) {
      allowDbl = false
      svgCanvas.setCurrentMode('textedit')
      svgCanvas.selectorManager.requestSelector(curtext).showGrips(false)

      // Crear textarea para edición multilínea
      const bbox = curtext.getBBox()
      let multilineEditor = document.getElementById('multiline_text_editor')

      if (!multilineEditor) {
        multilineEditor = document.createElement('textarea')
        multilineEditor.id = 'multiline_text_editor'
        multilineEditor.style.cssText = `
          position: absolute;
          background: white;
          border: 2px solid #4285f4;
          border-radius: 4px;
          padding: 8px;
          font-family: ${curtext.getAttribute('font-family') || 'Arial'};
          font-size: ${curtext.getAttribute('font-size') || '16'}px;
          color: ${curtext.getAttribute('fill') || 'black'};
          resize: both;
          z-index: 1000;
          min-width: 200px;
          min-height: 100px;
          word-wrap: break-word;
          overflow-wrap: break-word;
        `
        document.body.appendChild(multilineEditor)
      }

      // Extraer texto de los tspan
      const tspans = curtext.querySelectorAll('tspan')
      let textValue = ''

      // Verificar si hay texto original almacenado
      const storedText = curtext.getAttribute('data-original-text')
      if (storedText) {
        textValue = storedText
      } else {
        // Primera vez, extraer de tspans y almacenar
        tspans.forEach((tspan, index) => {
          // Extraer solo el texto visible (sin indicadores de overflow)
          const content = tspan.textContent
          if (!content.startsWith('+')) {
            if (index > 0) textValue += '\n'
            textValue += content
          }
        })
        // Almacenar el texto original para futuras referencias
        curtext.setAttribute('data-original-text', textValue)
      }

      multilineEditor.value = textValue

      // Posicionar el editor
      const workarea = document.getElementById('workarea')
      const workareaRect = workarea.getBoundingClientRect()

      const zoom = svgCanvas.getZoom()
      const left = workareaRect.left + (bbox.x * zoom) + workarea.scrollLeft
      const top = workareaRect.top + (bbox.y * zoom) + workarea.scrollTop

      // Usar tamaños almacenados o valores por defecto
      const storedWidth = parseFloat(curtext.getAttribute('data-text-box-width')) || 200
      const storedHeight = parseFloat(curtext.getAttribute('data-text-box-height')) || 100

      multilineEditor.style.left = `${left}px`
      multilineEditor.style.top = `${top}px`
      multilineEditor.style.width = `${Math.max(200, storedWidth * zoom)}px`
      multilineEditor.style.height = `${Math.max(100, storedHeight * zoom)}px`

      // Mostrar y enfocar
      multilineEditor.style.display = 'block'
      multilineEditor.focus()
      multilineEditor.select()

      // Manejar eventos
      const updateText = () => {
        const rawText = multilineEditor.value

        // Actualizar el texto original almacenado
        curtext.setAttribute('data-original-text', rawText)

        // Actualizar atributos de tamaño si el editor fue redimensionado
        const editorRect = multilineEditor.getBoundingClientRect()
        const zoom = svgCanvas.getZoom()
        const newWidth = editorRect.width / zoom
        const newHeight = editorRect.height / zoom

        curtext.setAttribute('data-text-box-width', newWidth)
        curtext.setAttribute('data-text-box-height', newHeight)

        // Añadir texto actual a los tspan para que applyAutoWrap pueda procesarlo
        while (curtext.firstChild) {
          curtext.removeChild(curtext.firstChild)
        }

        // Crear tspan temporal con el texto del editor
        const tempTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        tempTspan.setAttribute('x', curtext.getAttribute('x') || 0)
        tempTspan.setAttribute('dy', '0')
        tempTspan.textContent = rawText
        curtext.appendChild(tempTspan)

        // Aplicar auto-justificación usando la función applyAutoWrap
        svgCanvas.textActions.applyAutoWrap(curtext, newWidth, newHeight)
      }

      const hideEditor = () => {
        updateText()
        multilineEditor.style.display = 'none'
        svgCanvas.textActions.toSelectMode(true)
      }

      // Eventos del editor
      multilineEditor.onblur = hideEditor
      multilineEditor.onkeydown = (e) => {
        if (e.key === 'Escape') {
          hideEditor()
          e.preventDefault()
        }
      }

      // Auto-actualizar mientras se escribe
      multilineEditor.oninput = () => {
        updateText()
      }

      setTimeout(function () {
        allowDbl = true
      }, 300)
    },
    /**
     * @param {boolean|Element} selectElem
     * @fires module:svgcanvas.SvgCanvas#event:selected
     * @returns {void}
     */
    toSelectMode (selectElem) {
      svgCanvas.setCurrentMode('select')
      clearInterval(blinker)
      blinker = null
      if (selblock) {
        selblock.setAttribute('display', 'none')
      }
      if (cursor) {
        cursor.setAttribute('visibility', 'hidden')
      }
      curtext.style.cursor = 'move'

      if (selectElem) {
        svgCanvas.clearSelection()
        curtext.style.cursor = 'move'

        svgCanvas.call('selected', [curtext])
        svgCanvas.addToSelection([curtext], true)
      }
      if (!curtext?.textContent.length) {
        // No content, so delete
        svgCanvas.deleteSelectedElements()
      }

      textinput.blur()

      curtext = false

      // if (supportsEditableText()) {
      //   curtext.removeAttribute('editable');
      // }
    },
    /**
     * @param {Element} elem
     * @returns {void}
     */
    setInputElem (elem) {
      textinput = elem
    },
    /**
     * @returns {void}
     */
    clear () {
      if (svgCanvas.getCurrentMode() === 'textedit') {
        svgCanvas.textActions.toSelectMode()
      }
    },
    /**
     * @param {Element} _inputElem Not in use
     * @returns {void}
     */
    init (_inputElem) {
      if (!curtext) {
        return
      }
      let i
      let end
      // if (supportsEditableText()) {
      //   curtext.select();
      //   return;
      // }

      if (!curtext.parentNode) {
        // Result of the ffClone, need to get correct element
        const selectedElements = svgCanvas.getSelectedElements()
        curtext = selectedElements[0]
        svgCanvas.selectorManager.requestSelector(curtext).showGrips(false)
      }

      const str = curtext.textContent
      const len = str.length

      const xform = curtext.getAttribute('transform')

      textbb = utilsGetBBox(curtext)

      matrix = xform ? getMatrix(curtext) : null

      chardata = []
      chardata.length = len
      textinput.focus()

      curtext.removeEventListener('dblclick', selectWord)
      curtext.addEventListener('dblclick', selectWord)

      if (!len) {
        end = { x: textbb.x + textbb.width / 2, width: 0 }
      }

      for (i = 0; i < len; i++) {
        const start = curtext.getStartPositionOfChar(i)
        end = curtext.getEndPositionOfChar(i)

        if (!supportsGoodTextCharPos()) {
          const zoom = svgCanvas.getZoom()
          const offset = svgCanvas.contentW * zoom
          start.x -= offset
          end.x -= offset

          start.x /= zoom
          end.x /= zoom
        }

        // Get a "bbox" equivalent for each character. Uses the
        // bbox data of the actual text for y, height purposes

        // TODO: Decide if y, width and height are actually necessary
        chardata[i] = {
          x: start.x,
          y: textbb.y, // start.y?
          width: end.x - start.x,
          height: textbb.height
        }
      }

      // Add a last bbox for cursor at end of text
      chardata.push({
        x: end.x,
        width: 0
      })
      setSelection(textinput.selectionStart, textinput.selectionEnd, true)
    },
    /**
     * Aplica auto-justificación al texto multilínea (optimizada para tiempo real)
     * @param {Element} textElement
     * @param {Float} maxWidth
     * @param {Float} maxHeight
     * @returns {void}
     */
    applyAutoWrap (textElement, maxWidth, maxHeight) {
      // Función auxiliar para medir texto (cache para optimización)
      if (!this._measureCanvas) {
        this._measureCanvas = document.createElement('canvas')
        this._measureContext = this._measureCanvas.getContext('2d')
      }

      const measureTextWidth = (text, font) => {
        this._measureContext.font = font
        return this._measureContext.measureText(text).width
      }

      // Función para aplicar auto-justificación
      const autoWrapText = (text, maxWidth) => {
        const fontSize = parseFloat(textElement.getAttribute('font-size') || 16)
        const fontFamily = textElement.getAttribute('font-family') || 'Arial'
        const font = `${fontSize}px ${fontFamily}`

        const words = text.split(' ')
        const lines = []
        let currentLine = ''

        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word
          const testWidth = measureTextWidth(testLine, font)

          if (testWidth <= maxWidth || !currentLine) {
            currentLine = testLine
          } else {
            if (currentLine) {
              lines.push(currentLine)
              currentLine = word
            } else {
              // Palabra muy larga, añadirla como está
              lines.push(word)
              currentLine = ''
            }
          }
        }

        if (currentLine) {
          lines.push(currentLine)
        }

        return lines
      }

      // Función para detectar overflow vertical
      const checkVerticalOverflow = (lines, maxHeight) => {
        const fontSize = parseFloat(textElement.getAttribute('font-size') || 16)
        const lineHeight = fontSize * 1.2
        const totalHeight = lines.length * lineHeight

        return {
          hasOverflow: totalHeight > maxHeight,
          visibleLines: Math.floor(maxHeight / lineHeight),
          totalLines: lines.length
        }
      }

      // Extraer texto actual de los tspan
      let rawText = ''

      // Verificar si hay texto original almacenado
      const storedText = textElement.getAttribute('data-original-text')
      if (storedText) {
        rawText = storedText
      } else {
        // Primera vez, extraer de tspans y almacenar
        const tspans = textElement.querySelectorAll('tspan')
        tspans.forEach((tspan, index) => {
          // Extraer solo el texto visible (sin indicadores de overflow)
          const content = tspan.textContent
          if (!content.startsWith('+')) {
            if (index > 0) rawText += '\n'
            rawText += content
          }
        })
        // Almacenar el texto original para futuras referencias
        textElement.setAttribute('data-original-text', rawText)
      }

      // Si no hay texto, salir
      if (!rawText.trim()) return

      // Procesar cada párrafo por separado
      const paragraphs = rawText.split('\n')
      let allLines = []

      paragraphs.forEach((paragraph) => {
        if (paragraph.trim() === '') {
          allLines.push(' ') // Línea vacía
        } else {
          const wrappedLines = autoWrapText(paragraph, maxWidth)
          allLines = allLines.concat(wrappedLines)
        }
      })

      // Verificar overflow vertical
      const overflowInfo = checkVerticalOverflow(allLines, maxHeight)

      // Limpiar tspans existentes de forma eficiente
      while (textElement.firstChild) {
        textElement.removeChild(textElement.firstChild)
      }

      // Añadir tspans visibles
      const fontSize = parseFloat(textElement.getAttribute('font-size') || 16)
      const lineHeight = fontSize * 1.2
      const visibleLines = overflowInfo.hasOverflow ? overflowInfo.visibleLines - 1 : allLines.length

      // Crear fragmento para operaciones eficientes
      const fragment = document.createDocumentFragment()

      for (let i = 0; i < visibleLines; i++) {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        tspan.setAttribute('x', textElement.getAttribute('x') || 0)
        tspan.setAttribute('dy', i === 0 ? '0' : lineHeight)
        tspan.textContent = allLines[i] || ' '
        fragment.appendChild(tspan)
      }

      // Añadir indicador de overflow si es necesario
      if (overflowInfo.hasOverflow) {
        const overflowTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
        overflowTspan.setAttribute('x', textElement.getAttribute('x') || 0)
        overflowTspan.setAttribute('dy', lineHeight)
        overflowTspan.setAttribute('fill', '#ff6600')
        overflowTspan.setAttribute('font-weight', 'bold')
        overflowTspan.textContent = `+${overflowInfo.totalLines - visibleLines}`
        fragment.appendChild(overflowTspan)
      }

      // Añadir todo de una vez para mejor rendimiento
      textElement.appendChild(fragment)

      // Solo llamar 'changed' si no estamos en modo de redimensionamiento activo
      if (svgCanvas.getCurrentMode() !== 'resize') {
        svgCanvas.call('changed', [textElement])
      }
    }
  }
})()
