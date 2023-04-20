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

  constructor(wGame: DofusWindow, rootStore: RootStore, LL: TranslationFunctions) {
    super(wGame, rootStore, LL)
    console.log('- enabled fast sell mod')
    this.initialized = false
    this.windowManager = (this.wGame.findSingleton('getWindow', this.wGame) as any).exports
    this.load()
  }

  load() {
    this.init()
  }

  init() {
    if (!this.initialized && this.canInit()) {
      this.addMinusOneKamaSellingButton()
      this.addLongTapEventOnSellButton()

      this.initialized = true
      this.log('Enabled')
    }
  }

  canInit() {
    return this.wGame.document.querySelector('.ExchangeInventoryWindow')
  }

  addMinusOneKamaSellingButton() {
    const tradingWindow = this.sellingWindow
    const DTButton = (this.wGame.findSingleton('DofusButton', this.wGame) as any).exports

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

    const minusOneKamaButton = new DTButton({
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

  destroy(): void {
    const tradingWindow = this.sellingWindow
    if (this.evOnTradeOpen) tradingWindow?.removeListener('open', this.evOnTradeOpen)
    if (this.evOnTradeClose) tradingWindow?.removeListener('close', this.evOnTradeClose)
    if (this.evTradeOpenStd) tradingWindow?.removeListener('open', this.evTradeOpenStd)

    this.initialized = false
    this.log('Disabled')
  }
}
