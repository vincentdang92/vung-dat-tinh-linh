// Quản lý Chợ Phiên Ký Gửi & Giao Thương giữa người chơi
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { LIFE_ITEMS, bagCount, bagTake, bagAdd, bagCanAdd } from '../../shared/life.ts';
import type { MarketListing, MarketSale } from '../../shared/life.ts';
import type { Player } from './world.ts';

interface MarketData {
  listings: MarketListing[];
  pendingEarnings: Record<string, number>;
  salesHistory: Record<string, MarketSale[]>;
}

export class MarketManager {
  private dataDir?: string;
  private filePath?: string;
  private listings: MarketListing[] = [];
  private pendingEarnings: Record<string, number> = {};
  private salesHistory: Record<string, MarketSale[]> = {};
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir?: string) {
    if (dataDir) {
      this.dataDir = dataDir;
      try {
        mkdirSync(dataDir, { recursive: true });
        this.filePath = join(dataDir, 'market.json');
        this.loadLocal();
      } catch (err) {
        console.error('[Market] Không thể khởi tạo thư mục lưu trữ:', err);
      }
    }
  }

  private loadLocal() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const raw: MarketData = JSON.parse(readFileSync(this.filePath, 'utf8'));
      if (Array.isArray(raw.listings)) {
        this.listings = raw.listings.filter((l) => l && l.id && l.sellerToken && l.key && l.qty > 0 && l.unitPrice > 0);
      }
      if (raw.pendingEarnings && typeof raw.pendingEarnings === 'object') {
        this.pendingEarnings = raw.pendingEarnings;
      }
      if (raw.salesHistory && typeof raw.salesHistory === 'object') {
        this.salesHistory = raw.salesHistory;
      }
    } catch (err) {
      console.error('[Market] Lỗi khi nạp market.json:', err);
    }
  }

  private scheduleSave() {
    if (!this.filePath) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        const data: MarketData = {
          listings: this.listings,
          pendingEarnings: this.pendingEarnings,
          salesHistory: this.salesHistory,
        };
        const tmp = `${this.filePath}.tmp`;
        await writeFile(tmp, JSON.stringify(data), 'utf8');
        await rename(tmp, this.filePath!);
      } catch (err) {
        console.error('[Market] Lỗi khi lưu market.json:', err);
      }
    }, 100);
  }

  getListings(): MarketListing[] {
    return this.listings;
  }

  getPendingEarnings(token: string): number {
    return Math.max(0, this.pendingEarnings[token] ?? 0);
  }

  getSalesHistory(token: string): MarketSale[] {
    return this.salesHistory[token] ?? [];
  }

  /** Đăng bán một món hàng từ Giỏ Tre lên chợ ký gửi */
  createListing(seller: Player, key: string, qty: number, unitPrice: number): { ok: boolean; msg: string } {
    const item = LIFE_ITEMS[key];
    if (!item) return { ok: false, msg: 'Vật phẩm không hợp lệ' };
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) return { ok: false, msg: 'Số lượng phải từ 1 đến 99' };
    if (!Number.isInteger(unitPrice) || unitPrice <= 0 || unitPrice > 99999) return { ok: false, msg: 'Đơn giá phải từ 1 đến 99,999 Vàng' };

    // Giới hạn tối đa 10 đơn ký gửi mỗi người
    const myListings = this.listings.filter((l) => l.sellerToken === seller.prof.token);
    if (myListings.length >= 10) return { ok: false, msg: 'Bạn chỉ được ký gửi tối đa 10 món cùng lúc' };

    const bag = seller.prof.life?.bag;
    if (!bag || bagCount(bag, key) < qty) return { ok: false, msg: `Không đủ ${item.name} trong Giỏ Tre` };

    bagTake(bag, key, qty);

    const listing: MarketListing = {
      id: `${Date.now()}_${seller.prof.token.slice(0, 6)}_${Math.random().toString(36).slice(2, 6)}`,
      sellerToken: seller.prof.token,
      sellerName: seller.prof.name,
      key,
      name: item.name,
      icon: item.icon,
      kind: item.kind,
      qty,
      unitPrice,
      createdAt: Date.now(),
    };

    this.listings.unshift(listing);
    this.scheduleSave();
    return { ok: true, msg: `Đã ký gửi ${qty} ${item.name} lên Chợ Phiên với giá ${unitPrice} vàng/đơn vị` };
  }

  /** Mua hàng từ chợ ký gửi */
  buyListing(
    buyer: Player,
    listingId: string,
    qty: number,
    getOnlinePlayerByToken: (token: string) => Player | undefined,
  ): { ok: boolean; msg: string; sellerToken?: string; totalGold?: number; itemName?: string; qtyBought?: number } {
    const listing = this.listings.find((l) => l.id === listingId);
    if (!listing) return { ok: false, msg: 'Mặt hàng này không còn tồn tại hoặc đã được bán hết' };

    if (listing.sellerToken === buyer.prof.token) {
      return { ok: false, msg: 'Bạn không thể tự mua hàng do chính mình bày bán!' };
    }

    if (!Number.isInteger(qty) || qty <= 0) return { ok: false, msg: 'Số lượng mua không hợp lệ' };
    qty = Math.min(qty, listing.qty);

    const totalCost = qty * listing.unitPrice;
    if (buyer.prof.gold < totalCost) {
      return { ok: false, msg: `Bạn không đủ vàng (cần ${totalCost} vàng, đang có ${buyer.prof.gold} vàng)` };
    }

    const buyerBag = buyer.prof.life?.bag;
    if (!buyerBag || !bagCanAdd(buyerBag, listing.key, qty)) {
      return { ok: false, msg: 'Giỏ Tre của bạn đã đầy hoặc đạt giới hạn số lượng loại này' };
    }

    // Thực hiện giao dịch
    buyer.prof.gold -= totalCost;
    bagAdd(buyerBag, listing.key, qty);
    listing.qty -= qty;

    // Cộng tiền cho người bán (nếu online thì cộng thẳng và báo, nếu offline thì ghi vào pendingEarnings)
    const seller = getOnlinePlayerByToken(listing.sellerToken);
    if (seller) {
      seller.prof.gold += totalCost;
      seller.meDirty = true;
      seller.saveDirty = true;
    } else {
      this.pendingEarnings[listing.sellerToken] = (this.pendingEarnings[listing.sellerToken] ?? 0) + totalCost;
    }

    // Lưu lịch sử bán hàng
    const sale: MarketSale = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      buyerName: buyer.prof.name,
      itemKey: listing.key,
      itemName: listing.name,
      qty,
      totalGold: totalCost,
      time: Date.now(),
    };
    if (!this.salesHistory[listing.sellerToken]) {
      this.salesHistory[listing.sellerToken] = [];
    }
    this.salesHistory[listing.sellerToken].unshift(sale);
    if (this.salesHistory[listing.sellerToken].length > 15) {
      this.salesHistory[listing.sellerToken] = this.salesHistory[listing.sellerToken].slice(0, 15);
    }

    // Nếu hết hàng thì xoá listing
    if (listing.qty <= 0) {
      this.listings = this.listings.filter((l) => l.id !== listingId);
    }

    this.scheduleSave();
    return {
      ok: true,
      msg: `Đã mua thành công ${qty} ${listing.name} với giá ${totalCost} vàng!`,
      sellerToken: listing.sellerToken,
      totalGold: totalCost,
      itemName: listing.name,
      qtyBought: qty,
    };
  }

  /** Rút hàng ký gửi về Giỏ Tre */
  cancelListing(seller: Player, listingId: string): { ok: boolean; msg: string } {
    const listing = this.listings.find((l) => l.id === listingId);
    if (!listing) return { ok: false, msg: 'Đơn hàng không tồn tại' };
    if (listing.sellerToken !== seller.prof.token) return { ok: false, msg: 'Bạn không phải chủ sở hữu đơn hàng này' };

    const bag = seller.prof.life?.bag;
    if (!bag || !bagCanAdd(bag, listing.key, listing.qty)) {
      return { ok: false, msg: 'Giỏ Tre không đủ chỗ để nhận lại hàng' };
    }

    bagAdd(bag, listing.key, listing.qty);
    this.listings = this.listings.filter((l) => l.id !== listingId);
    this.scheduleSave();
    return { ok: true, msg: `Đã thu hồi ${listing.qty} ${listing.name} về Giỏ Tre` };
  }

  /** Thu tiền bán hàng khi offline */
  claimEarnings(player: Player): { claimed: number; msg: string } {
    const amount = this.pendingEarnings[player.prof.token] ?? 0;
    if (amount <= 0) return { claimed: 0, msg: 'Không có tiền bán hàng nào đang chờ nhận' };

    player.prof.gold += amount;
    delete this.pendingEarnings[player.prof.token];
    this.scheduleSave();
    return { claimed: amount, msg: `Đã thu nhận +${amount} Vàng từ các đơn bán thành công tại Chợ Phiên!` };
  }
}
