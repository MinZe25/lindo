import { Mod } from '@/mods/mod'
import { DofusWindow } from '@/dofus-window'
import { RootStore } from '@/store'
import { TranslationFunctions } from '@lindo/i18n'

export class FastBuy extends Mod {
  Debug = false
  private initialized: boolean
  private windowManager: any
  private touchended: any
  private evLongTap?: () => void

  constructor(wGame: DofusWindow, rootStore: RootStore, LL: TranslationFunctions) {
    super(wGame, rootStore, LL)
    this.initialized = false
    this.load()
  }

  load() {
    this.windowManager = (this.wGame.findSingleton('getWindow', this.wGame) as any).exports
    this.init()
  }

  init() {
    if (!this.initialized && this.canInit()) {
      console.log('- enabled fast buy mod')
      this.addLongTapEventOnBuyButton()

      this.initialized = true
    }
  }

  canInit() {
    return this.wGame.document.querySelector('.ExchangeInventoryWindow')
  }

  unload() {
    if (this.evLongTap) this.sellingWindow?.removeListener('open', this.evLongTap)
    this.initialized = false
  }

  addLongTapEventOnBuyButton() {
    const tradingWindow = this.sellingWindow

    let buyerTimeout: string | number | NodeJS.Timeout | undefined
    const proceedToBuy = () => {
      try {
        // Prevent infinit loop, when the concurence threading occure during clearTimeout operation
        if (this.touchended) {
          this.touchended = false
          return
        }
        const price = tradingWindow?.selection?.amountSoft
        const qty = tradingWindow?.selection?.qty
        const uid = tradingWindow?.selection?.item?.objectUID

        if (!price || !qty || !uid) return

        this.wGame.dofus?.connectionManager?.once(
          'ExchangeBidHouseBuyResultMessage',
          () => (buyerTimeout = setTimeout(() => proceedToBuy(), 300))
        )

        this.buyItem(uid, qty, price)
      } catch (ex) {
        console.error(ex)
      }
    }

    this.evLongTap = () => {
      const buyBtn = tradingWindow?.buySoftBtn

      buyBtn?.addListener('longtap', () => {
        this.touchended = false
        proceedToBuy()
        buyBtn.once('dom.touchend', () => {
          this.touchended = true
          clearTimeout(buyerTimeout)
        })
      })

      const listener = buyBtn?._events?.longtap?.slice?.(-1)?.[0] || buyBtn?._events?.longtap
      tradingWindow?.once('close', () => buyBtn?.removeListener('longtap', listener))
    }
    tradingWindow?.on('open', this.evLongTap)
  }

  buyItem(uid: number, qty: number, price: number) {
    this.wGame.dofus?.sendMessage('ExchangeBidHouseBuyMessage', { uid, qty, price })
  }

  get sellingWindow() {
    return this.windowManager?.getWindow('tradeItem')
  }

  getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  destroy(): void {
    this.unload()
  }
}
