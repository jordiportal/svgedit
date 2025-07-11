/* globals seAlert */
import SvgCanvas from '@svgedit/svgcanvas'
import { isChrome } from '@svgedit/svgcanvas/common/browser.js'

const { $id, $click, convertUnit, isValidUnit } = SvgCanvas
const homePage = 'https://github.com/SVG-Edit/svgedit'

/**
 *
 */
class MainMenu {
  /**
   * @param {PlainObject} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
    /**
     * @type {Integer}
     */
    this.editor.exportWindowCt = 0
  }

  /**
   *
   * @returns {void}
   */
  hideDocProperties () {
    const $imgDialog = $id('se-img-prop')
    $imgDialog.setAttribute('dialog', 'close')
    $imgDialog.setAttribute('save', this.editor.configObj.pref('img_save'))
    this.editor.docprops = false
  }

  /**
   *
   * @returns {void}
   */
  hidePreferences () {
    const $editDialog = $id('se-edit-prefs')
    $editDialog.setAttribute('dialog', 'close')
    this.editor.configObj.preferences = false
  }

  /**
   * @param {Event} e
   * @returns {boolean} Whether there were problems saving the document properties
   */
  saveDocProperties (e) {
    // set title
    const { title, w, h, save } = e.detail
    // set document title
    this.editor.svgCanvas.setDocumentTitle(title)

    if (w !== 'fit' && !isValidUnit('width', w)) {
      seAlert(this.editor.i18next.t('notification.invalidAttrValGiven'))
      return false
    }
    if (h !== 'fit' && !isValidUnit('height', h)) {
      seAlert(this.editor.i18next.t('notification.invalidAttrValGiven'))
      return false
    }
    if (!this.editor.svgCanvas.setResolution(w, h)) {
      seAlert(this.editor.i18next.t('notification.noContentToFitTo'))
      return false
    }
    // Set image save option
    this.editor.configObj.pref('img_save', save)
    this.editor.updateCanvas()
    this.hideDocProperties()
    return true
  }

  /**
   * Save user preferences based on current values in the UI.
   * @param {Event} e
   * @function module:SVGthis.savePreferences
   * @returns {Promise<void>}
   */
  async savePreferences (e) {
    const {
      lang,
      bgcolor,
      bgurl,
      gridsnappingon,
      gridsnappingstep,
      gridcolor,
      showrulers,
      baseunit
    } = e.detail
    // Set background
    this.editor.setBackground(bgcolor, bgurl)

    // set language
    if (lang && lang !== this.editor.configObj.pref('lang')) {
      this.editor.configObj.pref('lang', lang)
      seAlert('Changing the language needs reload')
    }

    // set grid setting
    this.editor.configObj.curConfig.gridSnapping = gridsnappingon
    this.editor.configObj.curConfig.snappingStep = gridsnappingstep
    this.editor.configObj.curConfig.gridColor = gridcolor
    this.editor.configObj.curConfig.showRulers = showrulers
    if (this.editor.configObj.curConfig.showRulers) {
      this.editor.rulers.updateRulers()
    }
    this.editor.configObj.curConfig.baseUnit = baseunit
    this.editor.svgCanvas.setConfig(this.editor.configObj.curConfig)
    this.editor.updateCanvas()
    this.hidePreferences()
  }

  /**
   *
   * @param e
   * @returns {Promise<void>} Resolves to `undefined`
   */
  async clickExport (e) {
    if (e?.detail?.trigger !== 'ok' || e?.detail?.imgType === undefined) {
      return
    }
    const imgType = e?.detail?.imgType
    const quality = e?.detail?.quality ? e?.detail?.quality / 100 : 1
    const advancedOptions = e?.detail?.advancedOptions || {}
    
    // Open placeholder window (prevents popup)
    let exportWindowName

    /**
     *
     * @returns {void}
     */
    const openExportWindow = () => {
      if (this.editor.configObj.curConfig.exportWindowType === 'new') {
        this.editor.exportWindowCt++
      }
      this.editor.exportWindowName =
        this.editor.configObj.curConfig.canvasName + this.editor.exportWindowCt
    }
    const chrome = isChrome()
    
    if (imgType === 'PDF') {
      // PDF estándar (original)
      if (!this.editor.customExportPDF && !chrome) {
        openExportWindow()
      }
      this.editor.svgCanvas.exportPDF(exportWindowName)
    } else if (imgType === 'PDF_ADVANCED') {
      // PDF avanzado con opciones configurables
      try {
        const windowName = exportWindowName || 'svgedit-advanced.pdf'
        const result = await this.editor.svgCanvas.exportAdvancedPDF(
          windowName,
          'save',
          advancedOptions
        )
        
        // Mostrar notificación de éxito
        if (result && result.advanced) {
          const { preserveLayers, vectorMode, embedFonts } = result.options
          let message = '🎉 PDF avanzado exportado exitosamente!\n\n'
          message += `📋 Opciones aplicadas:\n`
          message += `• Capas: ${preserveLayers ? 'Preservadas como OCG' : 'Combinadas'}\n`
          message += `• Renderizado: ${vectorMode === 'pure' ? 'Vectorial puro' : vectorMode === 'hybrid' ? 'Híbrido inteligente' : 'Rasterizado HD'}\n`
          message += `• Fuentes: ${embedFonts ? 'Embebidas' : 'Estándar'}\n\n`
          message += `💡 Abre el PDF en Adobe Reader para ver todas las funciones de capas.`
          
          console.log('Advanced PDF Export Success:', result)
          seAlert(message)
        }
      } catch (error) {
        console.error('Advanced PDF export failed:', error)
        seAlert(`❌ Error al exportar PDF avanzado:\n${error.message}\n\nSe recomienda probar con el modo 'Rasterizado de alta calidad'.`)
      }
    } else {
      // Otros formatos de imagen
      if (!this.editor.customExportImage) {
        openExportWindow()
      }
      /* const results = */ await this.editor.svgCanvas.rasterExport(
        imgType,
        quality,
        this.editor.exportWindowName
      )
    }
  }

  /**
   *
   * @returns {void}
   */
  showDocProperties () {
    if (this.editor.docprops) {
      return
    }
    this.editor.docprops = true
    const $imgDialog = $id('se-img-prop')

    // update resolution option with actual resolution
    const resolution = this.editor.svgCanvas.getResolution()
    if (this.editor.configObj.curConfig.baseUnit !== 'px') {
      resolution.w =
        convertUnit(resolution.w) + this.editor.configObj.curConfig.baseUnit
      resolution.h =
        convertUnit(resolution.h) + this.editor.configObj.curConfig.baseUnit
    }
    $imgDialog.setAttribute('save', this.editor.configObj.pref('img_save'))
    $imgDialog.setAttribute('width', resolution.w)
    $imgDialog.setAttribute('height', resolution.h)
    $imgDialog.setAttribute('title', this.editor.svgCanvas.getDocumentTitle())
    $imgDialog.setAttribute('dialog', 'open')
  }

  /**
   *
   * @returns {void}
   */
  showPreferences () {
    if (this.editor.configObj.preferences) {
      return
    }
    this.editor.configObj.preferences = true
    const $editDialog = $id('se-edit-prefs')
    // Update background color with current one
    const canvasBg = this.editor.configObj.curPrefs.bkgd_color
    const url = this.editor.configObj.pref('bkgd_url')
    if (url) {
      $editDialog.setAttribute('bgurl', url)
    }
    $editDialog.setAttribute(
      'gridsnappingon',
      this.editor.configObj.curConfig.gridSnapping
    )
    $editDialog.setAttribute(
      'gridsnappingstep',
      this.editor.configObj.curConfig.snappingStep
    )
    $editDialog.setAttribute(
      'gridcolor',
      this.editor.configObj.curConfig.gridColor
    )
    $editDialog.setAttribute('canvasbg', canvasBg)
    $editDialog.setAttribute('dialog', 'open')
  }

  /**
   *
   * @returns {void}
   */
  openHomePage () {
    window.open(homePage, '_blank')
  }

  /**
   * @type {module}
   */
  init () {
    // add Top panel
    const template = document.createElement('template')
    template.innerHTML = `
    <se-menu id="main_button" label="SVG-Edit" src="logo.svg" alt="logo">
        <se-menu-item id="tool_export" label="tools.export_img" src="export.svg"></se-menu-item>
        <se-menu-item id="tool_docprops" label="tools.docprops" shortcut="shift+D" src="docprop.svg"></se-menu-item>
        <se-menu-item id="tool_editor_prefs" label="config.editor_prefs" src="editPref.svg"></se-menu-item>
        <se-menu-item id="tool_editor_homepage" label="tools.editor_homepage" src="logo.svg"></se-menu-item>
    </se-menu>`
    this.editor.$svgEditor.append(template.content.cloneNode(true))

    // register action to main menu entries
    /**
     * Associate all button actions as well as non-button keyboard shortcuts.
     */
    $click($id('tool_export'), function () {
      document
        .getElementById('se-export-dialog')
        .setAttribute('dialog', 'open')
    })
    $id('se-export-dialog').addEventListener(
      'change',
      this.clickExport.bind(this)
    )
    $id('tool_docprops').addEventListener(
      'click',
      this.showDocProperties.bind(this)
    )
    $id('tool_editor_prefs').addEventListener(
      'click',
      this.showPreferences.bind(this)
    )
    $id('tool_editor_homepage').addEventListener(
      'click',
      this.openHomePage.bind(this)
    )
    $id('se-img-prop').addEventListener(
      'change',
      function (e) {
        if (e.detail.dialog === 'closed') {
          this.hideDocProperties()
        } else {
          this.saveDocProperties(e)
        }
      }.bind(this)
    )
    $id('se-edit-prefs').addEventListener(
      'change',
      function (e) {
        if (e.detail.dialog === 'closed') {
          this.hidePreferences()
        } else {
          this.savePreferences(e)
        }
      }.bind(this)
    )
  }
}

export default MainMenu
