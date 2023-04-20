import { Mod } from '@/mods/mod'
import { RootStore } from '@/store'
import { TranslationFunctions } from '@lindo/i18n'
import { DofusWindow } from '@/dofus-window'

export class FastSell extends Mod {
  ID = 'ElySellFastButton'
  Debug = false

  quantities = [1, 10, 100]
  private initialized: boolean
  private windowManager: any
  private evOnTradeOpen?: () => void
  private evOnTradeClose?: () => void
  private evTradeOpenStd?: () => void
  private touchended?: boolean
  private ButtonCreator: any
  private button: any
  private inventoryWindow: any
  private tradeWindow: any
  private tradeStorageWindow: any
  private created: boolean = false
  private originalTradeWindowHeight: any
  private currentList: any

  constructor(wGame: DofusWindow, rootStore: RootStore, LL: TranslationFunctions) {
    super(wGame, rootStore, LL)
    console.log('- enabled fast sell mod')
    this.initialized = false
    this.windowManager = (this.wGame.findSingleton('getWindow', this.wGame) as any).exports
    this.load()
  }

  initButton() {
    this.button = new this.ButtonCreator({ className: 'button', text: 'Vender todos los objetos visibles' }, () => {
      this.currentList = this.getSortedItems()
      this.wGame.gui.openConfirmPopup({
        title: 'Venta automática de los objetos visibles',
        message: '¿Estás seguro de que quieres venderlo todo?',
        cb: async (accepted: boolean) => {
          if (accepted) {
            await this.sellEverything()
            this.wGame.gui?.chat?._logServerText("<span style ='color:orange'>Venta Terminada !</span>")
          }
        }
      })
    })
  }

  load() {
    this.init()
    this.initButton()
    this.inventoryWindow = this.windowManager.getWindow('tradeInventory')
    this.tradeWindow = this.windowManager.getWindow('tradeItem')
    this.tradeStorageWindow = this.windowManager.getWindow('tradeStorage')
    this.tradeWindow.once('open', this.createButton)
    this.tradeWindow.on('open', this.onFirstOpenNeedResize)
  }

  init() {
    if (!this.initialized && this.canInit()) {
      this.addMinusOneKamaSellingButton()
      this.addLongTapEventOnSellButton()

      this.initialized = true
      this.log('Enabled')
    }
  }

  async sellEverything() {
    const uidToSell = this.getSortedItems()
    for (const uid of uidToSell) {
      if (this.tradeStorageWindow.isVisible()) {
        this.tradeWindow.displayItem('sell-bidHouse', this.wGame.gui.playerData.inventory.objects[uid])
        await this.waitDisplay()
        while (this.getQtyItems(uid)) {
          if (!this.tradeStorageWindow.isVisible()) {
            this.wGame.gui?.chat?._logServerText(
              '<span style ="color:orange">La fenetre a été fermée, la vente a été interrompue.</span>'
            )
            return
          }
          if (!this.tradeWindow.isVisible()) {
            this.wGame.gui?.chat?._logServerText(
              '<span style ="color:orange">La fenetre a été fermée, la vente a été interrompue.</span>'
            )
            return
          }
          if (!this.tradeWindow.bidHouseSellerBox.isVisible()) {
            this.wGame.gui?.chat?._logServerText(
              '<span style ="color:orange">La fenetre a été fermée, la vente a été interrompue.</span>'
            )
            return
          }
          if (this.isStorageFull()) {
            this.wGame.gui?.chat?._logServerText(
              '<span style ="color:orange">Ton stockage en hdv est plein, la vente a été interrompue.</span>'
            )
            return
          }
          await this.waitSell()
          if (this.currentItemPrice > 2) {
            this.sellCurrentItemAtCurrentPriceForCurrentQuantity()
          } else {
            break
          }
        }
      } else {
        this.wGame.gui?.chat?._logServerText(
          '<span style ="color:orange">La fenetre a été fermée, la vente a été interrompue.</span>'
        )
        return
      }
    }
  }

  isStorageFull() {
    return this.tradeStorageWindow._itemCount >= this.wGame.gui.playerData.characterBaseInformations.level * 5
  }

  waitDisplay(time = 300, offset = 50) {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * offset + time))
  }

  canInit() {
    return this.wGame.document.querySelector('.ExchangeInventoryWindow')
  }

  onFirstOpenNeedResize = () => {
    if (this.button && this.tradeWindow.bidHouseSellerBox.isVisible()) {
      this.originalTradeWindowHeight = this.tradeWindow.rootElement.style.height
      this.tradeWindow.rootElement.style.height = '540px'
    }
  }

  addMinusOneKamaSellingButton() {
    const tradingWindow = this.sellingWindow
    this.ButtonCreator = (this.wGame.findSingleton('DofusButton', this.wGame) as any).exports

    let sellTimeout: string | number | NodeJS.Timeout | undefined
    // Used for long tap only
    const proceedToSell = () => {
      try {
        // Prevent infinit loop, when the concurrency threading occure during clearTimeout operation
        if (this.touchended) {
          this.touchended = false
          return
        }
        const qty = this.itemToSellQuantity
        const uid = this.sellingSettingsWindow?.item?.objectUID
        if (!qty || !uid) return

        this.wGame.dofus?.connectionManager?.once('ExchangeBidHouseItemAddOkMessage', (response) => {
          const soldQty = response.itemInfo?.quantity || 0
          const newQty = this.itemToSellQuantity - soldQty

          if (this.currentSellingQuantity > 1) while (newQty < this.currentSellingQuantity) this.changeQuantity(-1)

          sellTimeout = setTimeout(() => proceedToSell(), 300)
        })

        this.sellItem(
          this.sellingSettingsWindow?.item?.objectUID,
          this.currentSellingQuantity,
          this.currentItemPrice === 1 ? 1 : this.currentItemPrice
        )
      } catch (ex) {
        console.error(ex)
      }
    }

    const minusOneKamaButton = new this.ButtonCreator({
      className: ['greenButton', 'mirage-minus-one-kama'],
      text: 'Venta Rápida',
      tooltip: 'Pon el objeto a la venta con el mismo precio'
    })

    minusOneKamaButton.addListener('tap', () => {
      this.sellCurrentItemAtCurrentPriceForCurrentQuantity()
      minusOneKamaButton.disable()
      setTimeout(() => minusOneKamaButton.enable(), 300)
    })

    minusOneKamaButton.addListener('longtap', () => {
      this.touchended = false
      proceedToSell()
      minusOneKamaButton.once('dom.touchend', () => {
        this.touchended = true
        clearTimeout(sellTimeout)
      })
    })

    tradingWindow?.addListener(
      'open',
      (this.evOnTradeOpen = () => {
        const sellBtn = tradingWindow?.bidHouseSellerBox?.sellBtn?.rootElement
        sellBtn?.after?.(minusOneKamaButton.rootElement)
      })
    )

    tradingWindow?.addListener(
      'close',
      (this.evOnTradeClose = () => {
        minusOneKamaButton.rootElement.remove()
      })
    )
  }

  /**
   * Sells the selected item at the given price minus 1, for the selected quantity
   */
  sellCurrentItemAtCurrentPriceForCurrentQuantity() {
    this.wGame.dofus.connectionManager.on('ExchangeBidHouseItemAddOkMessage', (response) => {
      const soldQty = response.itemInfo.quantity || 0
      const newQty = this.itemToSellQuantity - soldQty

      if (this.currentSellingQuantity > 1) while (newQty < this.currentSellingQuantity) this.changeQuantity(-1)

      this.wGame.dofus?.connectionManager?.removeListener('ExchangeBidHouseItemAddOkMessage', listener)
    })
    const cm = this.wGame.dofus?.connectionManager as any
    const listener = cm?.eventHandlers?.ExchangeBidHouseItemAddOkMessage?.slice(-1)?.[0]

    this.sellItem(
      this.sellingSettingsWindow?.item?.objectUID,
      this.currentSellingQuantity,
      this.currentItemPrice === 1 ? 1 : this.currentItemPrice
    )
  }

  sellItem(objectUID: any, quantity: any, price: any) {
    this.wGame.dofus?.sendMessage('ExchangeObjectMovePricedMessage', { objectUID, quantity, price })
  }

  changeQuantity(indexShift: any) {
    this.sellingSettingsWindow?.quantitySelect?.setValue(
      this.quantities[this.quantities.indexOf(this.currentSellingQuantity) + indexShift]
    )
    this.sellingSettingsWindow?.quantitySelect?.emit(
      'change',
      this.quantities[this.quantities.indexOf(this.currentSellingQuantity) + indexShift]
    )
  }

  addLongTapEventOnSellButton() {
    const tradingWindow = this.sellingWindow

    let sellTimeout: string | number | NodeJS.Timeout | undefined
    const proceedToSell = () => {
      try {
        // Prevent infinit loop, when the concurrency threading occure during clearTimeout operation
        if (this.touchended) {
          this.touchended = false
          return
        }
        const price = this.currentItemPriceLotSettle
        const qty = this.currentSellingQuantity
        const uid = this.sellingSettingsWindow?.item?.objectUID
        this.log('Try sell item ' + uid + ', qty: ' + qty + ', price: ' + price)
        if (!price || !qty || !uid) return

        this.wGame.dofus?.connectionManager?.once(
          'ExchangeBidHouseItemAddOkMessage',
          () => (sellTimeout = setTimeout(() => proceedToSell(), 300))
        )

        this.wGame.dofus?.sendMessage('ExchangeObjectMovePricedMessage', {
          objectUID: uid,
          quantity: qty,
          price
        })
      } catch (ex) {
        console.error(ex)
      }
    }

    tradingWindow?.on(
      'open',
      (this.evTradeOpenStd = () => {
        const sellBtn = this.sellingSettingsWindow.sellBtn

        sellBtn?.addListener('longtap', () => {
          this.touchended = false
          proceedToSell()
          sellBtn.once('dom.touchend', () => {
            this.touchended = true
            clearTimeout(sellTimeout)
          })
        })

        const listener = sellBtn?._events?.longtap?.slice?.(-1)?.[0] || sellBtn?._events?.longtap
        tradingWindow?.once('close', () => sellBtn?.removeListener('longtap', listener))
      })
    )
  }

  get currentItemPriceLotSettle() {
    return this.sellingSettingsWindow?.price
  }

  get currentItemPrice() {
    const price =
      this.sellingSettingsWindow?.minPricesCache?.[this.sellingSettingsWindow?.item?.objectGID]?.[
        this.quantities.indexOf(this.currentSellingQuantity)
      ]

    return price ?? 1
  }

  get sellingWindow() {
    return this.windowManager?.getWindow('tradeItem')
  }

  get currentSellingQuantity() {
    const quantity = this.sellingSettingsWindow?.quantity
    return quantity ?? 0
  }

  get itemToSellQuantity() {
    return this.sellingSettingsWindow?.item?.quantity ?? 0
  }

  /**
   * Window with the price, quantity, fees, etc
   */
  get sellingSettingsWindow() {
    return this.sellingWindow?.bidHouseSellerBox
  }

  log(msg: any) {
    if (this.Debug) {
      console.log('- ' + this.ID + ' - ' + msg)
    }
  }

  waitSell(time = 300, offset = 0) {
    return new Promise((resolve) => setTimeout(resolve, Math.random() * offset + time))
  }

  getSortedItems() {
    return this.inventoryWindow.storageView._sortedItemList
  }

  createButton = () => {
    setTimeout(() => {
      if (!this.tradeWindow.bidHouseSellerBox) {
        this.tradeWindow.once('open', this.createButton)
      } else if (!this.tradeWindow.bidHouseSellerBox.isVisible()) {
        this.tradeWindow.once('open', this.createButton)
      } else if (this.button && this.tradeWindow.bidHouseSellerBox.isVisible()) {
        this.created = true
        this.tradeWindow.bidHouseSellerBox.rootElement.appendChild(this.button.rootElement)
      }
    }, 500)
  }

  getQtyItems(id: number): number {
    return this.inventoryWindow.storageView.getDisplayedQuantity(id)
  }

  destroy(): void {
    const tradingWindow = this.sellingWindow
    if (this.evOnTradeOpen) tradingWindow?.removeListener('open', this.evOnTradeOpen)
    if (this.evOnTradeClose) tradingWindow?.removeListener('close', this.evOnTradeClose)
    if (this.evTradeOpenStd) tradingWindow?.removeListener('open', this.evTradeOpenStd)

    this.initialized = false
    this.log('Disabled')
  }
}
