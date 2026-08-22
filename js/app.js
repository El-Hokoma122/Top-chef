const API_BASE = "https://topchef-system.fastapicloud.dev";

// ===================================================
//  State
// ===================================================
let categories = [];
let products = [];
let offers = [];
let selectedOffer = null;
let pricingPreview = { discount_amount: 0, total_amount: 0 };
let pricingTimer = null;
let liveSocket = null;
let liveReconnectTimer = null;
let activeCatId = null;
let cart = [];
let reviews = [];
let reviewsSummary = { total: 0, average_rating: 0 };
let currentReviewsPage = 1;
const REVIEWS_PAGE_SIZE = 10; // Fetch 10 at a time for better UX
let selectedRating = 0;
let lastEnteredName = "عميل سعيد"; // بديل للـ localStorage لحفظ الاسم مؤقتاً خلال الجلسة

// ===================================================
//  Init & Fetch Data
// ===================================================
async function init() {
  try {
    // Fetch Data from API
    const [catsRes, prodsRes, offersRes] = await Promise.all([
      fetch(`${API_BASE}/menu/categories`),
      fetch(`${API_BASE}/menu/products`),
      fetch(`${API_BASE}/offers/`)
    ]);

    if (!catsRes.ok || !prodsRes.ok) throw new Error("API error loading menu");

    const fetchedCategories = await catsRes.json();
    const fetchedProducts = await prodsRes.json();
    const fetchedOffers = offersRes.ok ? await offersRes.json() : [];

    // Filter active categories and available products
    categories = Array.isArray(fetchedCategories) ? fetchedCategories.filter(c => c.is_active) : [];
    products = Array.isArray(fetchedProducts) ? fetchedProducts.filter(p => p.is_available) : [];
    offers = filterCurrentOffers(fetchedOffers);

    if (categories.length > 0) {
      activeCatId = categories[0].id;
    }

    renderTabs();
    renderItems();
    renderOffers();
    loadReviews();
    setupLiveUpdates();
  } catch (err) {
    console.error("API Error:", err);
    document.getElementById("items_grid").innerHTML = `<p style="color:#e40411;text-align:center;grid-column:1/-1;">عذراً، حدث خطأ في تحميل المنيو. يرجى المحاولة لاحقاً.</p>`;
  }
}

function filterCurrentOffers(list) {
  const now = Date.now();
  return (Array.isArray(list) ? list : []).filter(offer => {
    const starts = offer.valid_from ? new Date(offer.valid_from).getTime() : 0;
    const ends = offer.valid_to ? new Date(offer.valid_to).getTime() : Infinity;
    const usageAvailable = !offer.usage_limit || Number(offer.current_usage || 0) < Number(offer.usage_limit);
    return offer.is_active && starts <= now && now <= ends && usageAvailable;
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function offerValueLabel(offer) {
  const value = Number(offer.discount_value || 0);
  const percentTypes = ["percentage", "quantity_discount", "category_discount", "happy_hour"];
  if (offer.discount_type === "free_delivery") return "توصيل مجاني";
  if (["buy_one_get_one", "buy_x_get_y"].includes(offer.discount_type)) return "هدية";
  if (offer.discount_type === "combo") return "كومبو";
  return percentTypes.includes(offer.discount_type) ? `خصم ${value}%` : `وفر ${value} ج.م`;
}

function offerDetails(offer) {
  const rules = offer.rules || {};
  const parts = [];
  const categoryNames = (rules.category_ids || []).map(id => categories.find(cat => Number(cat.id) === Number(id))?.cat_name).filter(Boolean);
  const productCategories = [...new Set((offer.product_ids || []).map(id => {
    const product = products.find(item => Number(item.id) === Number(id));
    return categories.find(cat => Number(cat.id) === Number(product?.cat_id))?.cat_name;
  }).filter(Boolean))];
  const involvedSections = categoryNames.length ? categoryNames : productCategories;
  if (involvedSections.length) parts.push(`في قسم ${involvedSections.join("، ")}`);
  const includedProductNames = (offer.product_ids || []).map(id => products.find(item => Number(item.id) === Number(id))?.product_name).filter(Boolean);
  if (includedProductNames.length && includedProductNames.length <= 3) parts.push(`على ${includedProductNames.join("، ")}`);
  if (Number(offer.min_order_amount) > 0) parts.push(`للطلبات التي تبدأ من ${Number(offer.min_order_amount)} ج.م`);
  if (offer.min_quantity) parts.push(`بحد أدنى ${offer.min_quantity} قطع`);
  if (offer.max_quantity) parts.push(`بحد أقصى ${offer.max_quantity} قطع`);
  if (offer.max_discount_amount) parts.push(`أقصى خصم ${Number(offer.max_discount_amount)} ج.م`);
  if (offer.usage_limit) {
    const remaining = Math.max(0, Number(offer.usage_limit) - Number(offer.current_usage || 0));
    parts.push(`متبقي ${remaining} قسيمة`);
  }
  if (offer.usage_per_user) parts.push(`متاح ${Number(offer.usage_per_user)} مرة لكل عميل`);
  if (offer.discount_type === "quantity_discount" && rules.quantity_required) parts.push(`عند شراء ${rules.quantity_required} قطع`);
  if (offer.discount_type === "happy_hour" && rules.start_time && rules.end_time) parts.push(`من ${rules.start_time} إلى ${rules.end_time}`);
  if (offer.discount_type === "combo" && rules.combo_price) parts.push(`سعر الكومبو ${Number(rules.combo_price)} ج.م`);
  if (offer.discount_type === "buy_x_get_y") parts.push(`اشتري ${rules.buy_quantity || 1} وخد ${rules.get_quantity || 1}`);
  if (offer.discount_type === "buy_one_get_one") parts.push("اشتري واحدة وخد واحدة هدية");
  if (offer.valid_to) {
    const endDate = new Date(offer.valid_to);
    if (!Number.isNaN(endDate.getTime())) parts.push(`متاح لحد ${endDate.toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`);
  }
  return parts.join(" • ") || "استمتع بالعرض على طلبك قبل انتهاء المدة";
}

function renderOffers() {
  const section = document.getElementById("offers_section");
  const track = document.getElementById("offers_track");
  if (!section || !track) return;
  section.hidden = offers.length === 0;
  track.innerHTML = offers.map(offer => {
    const detailChips = offerDetails(offer).split(" • ").map(detail => {
      const important = /متبقي|مرة لكل عميل|أقصى خصم/.test(detail) ? " important" : "";
      return `<span class="${important.trim()}">${escapeHtml(detail)}</span>`;
    }).join("");
    return `
    <article class="offer_card">
      <div class="offer_card_top"><h3>${escapeHtml(offer.display_name || offer.code)}</h3><span class="offer_value">${escapeHtml(offerValueLabel(offer))}</span></div>
      <div class="offer_details">${detailChips}</div>
      <div class="offer_action"><span class="offer_code"><b>استخدم كود العرض</b> ${escapeHtml(offer.code)}</span></div>
    </article>`;
  }).join("");
}

function selectOffer(offerId, autoAddProducts = false) {
  selectedOffer = offers.find(offer => Number(offer.offer_id) === Number(offerId)) || null;
  if (selectedOffer && autoAddProducts) addOfferProductsToCart(selectedOffer);
  renderOffers();
  updateSelectedOfferUI();
  schedulePricingPreview(true);
  document.getElementById("cart_modal").style.display = "flex";
  showToast(selectedOffer ? "تمت إضافة العرض ومكوناته للسلة" : "العرض غير متاح", selectedOffer ? "success" : "error");
}

function applyOfferCode(event) {
  event?.preventDefault();
  const input = document.getElementById("offer_code_input");
  const code = (input?.value || "").trim().toUpperCase();
  const offer = offers.find(item => String(item.code).toUpperCase() === code);
  if (!offer) { showToast("كود العرض غير صحيح أو العرض غير متاح حالياً", "error"); return; }
  selectOffer(offer.offer_id, true);
}

function offerAppliesToProduct(offer, product) {
  const rules = offer.rules || {};
  const ids = [
    ...(offer.product_ids || []), ...(rules.buy_product_ids || []), ...(rules.get_product_ids || []),
    ...(rules.requirements || []).map(item => item.product_id)
  ].map(Number);
  if (ids.includes(Number(product.id))) return true;
  return (rules.category_ids || []).map(Number).includes(Number(product.cat_id));
}

function offersForProduct(productId) {
  const product = products.find(item => Number(item.id) === Number(productId));
  return product ? offers.filter(offer => offerAppliesToProduct(offer, product)) : [];
}

function cheapestCartItemForProduct(productId) {
  const product = products.find(item => Number(item.id) === Number(productId));
  if (!product) return null;
  const variants = (product.variants || []).filter(item => Number(item.price) > 0).sort((a, b) => Number(a.price) - Number(b.price));
  const variant = variants[0] || null;
  return { id: product.id, variantId: variant?.id ?? null, name: variant ? `${product.product_name} - ${variant.name}` : product.product_name, price: Number(variant?.price || 0) };
}

function requiredOfferProducts(offer) {
  const rules = offer.rules || {};
  if (offer.discount_type === "combo" && rules.requirements?.length) return rules.requirements.map(item => ({ id: item.product_id, qty: Number(item.quantity || 1) }));
  if (offer.discount_type === "buy_x_get_y") return [
    ...((rules.buy_product_ids || []).slice(0, 1).map(id => ({ id, qty: Number(rules.buy_quantity || 1) }))),
    ...((rules.get_product_ids || []).slice(0, 1).map(id => ({ id, qty: Number(rules.get_quantity || 1) })))
  ];
  const ids = offer.product_ids || [];
  const qty = offer.discount_type === "buy_one_get_one" ? 2 : Number(rules.quantity_required || offer.min_quantity || 1);
  return ids.map(id => ({ id, qty }));
}

function addOfferProductsToCart(offer) {
  requiredOfferProducts(offer).forEach(required => {
    const item = cheapestCartItemForProduct(required.id);
    if (!item) return;
    const uniqId = item.id + "_" + (item.variantId || "null");
    const existing = cart.find(entry => entry.uniqId === uniqId);
    if (existing) existing.qty = Math.max(existing.qty, required.qty);
    else cart.push({ uniqId, item, qty: required.qty });
  });
  updateCartUI();
}

function clearSelectedOffer() {
  selectedOffer = null;
  pricingPreview = { discount_amount: 0, total_amount: 0 };
  renderOffers();
  updateSelectedOfferUI();
  updateCartUI({ skipPreview: true });
}

function updateSelectedOfferUI() {
  const bar = document.getElementById("selected_offer_bar");
  if (!bar) return;
  bar.hidden = !selectedOffer;
  if (selectedOffer) document.getElementById("selected_offer_name").textContent = selectedOffer.display_name || selectedOffer.code;
}

async function refreshCommerceData(showNotice = false) {
  try {
    const [catsRes, prodsRes, offersRes] = await Promise.all([
      fetch(`${API_BASE}/menu/categories`, { cache: "no-store" }),
      fetch(`${API_BASE}/menu/products`, { cache: "no-store" }),
      fetch(`${API_BASE}/offers/`, { cache: "no-store" })
    ]);
    if (!catsRes.ok || !prodsRes.ok) return;
    categories = (await catsRes.json()).filter(cat => cat.is_active);
    products = (await prodsRes.json()).filter(product => product.is_available);
    offers = offersRes.ok ? filterCurrentOffers(await offersRes.json()) : offers;
    if (!categories.some(cat => cat.id === activeCatId)) activeCatId = categories[0]?.id ?? null;
    if (selectedOffer) selectedOffer = offers.find(offer => offer.offer_id === selectedOffer.offer_id) || null;
    syncCartWithLatestProducts();
    renderTabs(); renderItems(); renderOffers(); updateSelectedOfferUI(); updateCartUI();
    if (showNotice) showToast("المنيو والعروض اتحدثوا دلوقتي");
  } catch (error) { console.warn("Live refresh failed", error); }
}

function syncCartWithLatestProducts() {
  cart = cart.flatMap(entry => {
    const product = products.find(item => Number(item.id) === Number(entry.item.id));
    if (!product) return [];
    const variant = (product.variants || []).find(item => Number(item.id) === Number(entry.item.variantId));
    if (entry.item.variantId != null && !variant) return [];
    const latestPrice = variant ? Number(variant.price) : entry.item.price;
    return [{ ...entry, item: { ...entry.item, price: latestPrice } }];
  });
}

function setupLiveUpdates() {
  if (!window.WebSocket || (liveSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(liveSocket.readyState))) return;
  const wsUrl = `${API_BASE.replace(/^http/, "ws")}/orders/ws/online`;
  const socket = new WebSocket(wsUrl);
  liveSocket = socket;
  socket.onmessage = event => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "HEARTBEAT") { socket.send(JSON.stringify({ type: "HEARTBEAT_ACK" })); return; }
      if (["PRODUCT_UPDATED", "CATEGORY_UPDATED", "OFFER_UPDATED", "NEW_ORDER"].includes(payload.type)) refreshCommerceData(payload.type !== "NEW_ORDER");
    } catch (error) { console.warn("Invalid live update", error); }
  };
  socket.onclose = () => {
    if (liveSocket === socket) liveSocket = null;
    clearTimeout(liveReconnectTimer);
    liveReconnectTimer = setTimeout(setupLiveUpdates, 3000);
  };
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) { refreshCommerceData(); setupLiveUpdates(); } });


// ===================================================
//  Render Tabs
// ===================================================
function renderTabs() {
  const container = document.getElementById("category_tabs");
  container.innerHTML = "";

  categories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "tab_btn" + (cat.id === activeCatId ? " active" : "");
    btn.textContent = cat.cat_name;
    btn.onclick = () => {
      activeCatId = cat.id;
      // update active styling
      document.querySelectorAll(".tab_btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderItems();
    };
    container.appendChild(btn);
  });
}

// ===================================================
//  Render Items
// ===================================================
function renderItems() {
  const grid = document.getElementById("items_grid");
  grid.innerHTML = "";

  const catProducts = products.filter(p => p.cat_id === activeCatId);

  if (catProducts.length === 0) {
    grid.innerHTML = `<p style="color:var(--color-subtext);grid-column:1/-1;text-align:center;padding:30px">عذراً، لا توجد أصناف في هذا القسم حالياً.</p>`;
    return;
  }

  catProducts.forEach(product => {
    const variants = product.variants || [];
    const prices = variants.map(v => parseFloat(v.price)).filter(p => !isNaN(p) && p > 0);
    const price = prices.length > 0 ? Math.min(...prices) : 0;
    
    const priceLabel = variants.length > 1 ? `يبدأ من ${price} ج.م` : (price > 0 ? `${price} ج.م` : "السعر غير محدد");
    
    // Some backend products have image_url, though many do not.
    // ===== الصور معلّقة مؤقتاً - يمكن تفعيلها لاحقاً عند الحاجة =====
    // const imgSrc = product.image_url ? product.image_url : null;
    // let imgHtml = '';
    // if(imgSrc) {
    //     imgHtml = `<img src="${imgSrc}" alt="${product.product_name}" style="width:100%;height:150px;object-fit:cover;border-radius:10px;margin-bottom:12px;" onerror="this.style.display='none'">`;
    // }
    // const finalImgSrc = product.image_url ? product.image_url : "../assets/Gemini_Generated_Image_hsee73hsee73hsee.png";
    // =====================================================================

    const description = product.description || product.desc || product.product_desc || "";
    const productOffers = offersForProduct(product.id);
    const offerBadges = productOffers.length ? `<div class="product_offer_badges">${productOffers.map(offer => `<span class="product_offer_badge">${escapeHtml(offer.display_name || offerValueLabel(offer))}</span>`).join("")}</div>` : "";
    
    const card = document.createElement("div");
    card.className = "item_card";

    card.innerHTML = `
      ${/* الصور معلّقة مؤقتاً */ ''}
      <!--
      <div class="item_img_holder">
        <img src="${product.image_url || '../assets/Gemini_Generated_Image_hsee73hsee73hsee.png'}" alt="${product.product_name}" onerror="this.src='../assets/توب شيف 1.png'">
      </div>
      -->
      <h3>${product.product_name}</h3>
      ${offerBadges}
      ${description ? `<p>${description}</p>` : ''}
      <div class="item_price">
        <span>${priceLabel}</span>
        <button class="add_btn" onclick="(function(e){ e.stopPropagation(); handleProductClick(${JSON.stringify(product).replace(/"/g, '&quot;')}, ${price}); })(event)">+</button>
      </div>
    `;
    
    // clicking anywhere on card also triggers addition/variant popup
    card.onclick = () => handleProductClick(product, price);
    grid.appendChild(card);
  });
}

// ===================================================
//  Variant Picker & Adding to Cart
// ===================================================
function handleProductClick(product, defaultPrice) {
  const variants = product.variants || [];
  if (variants.length <= 1) {
    const vId = variants.length === 1 ? variants[0].id : null;
    const finalPrice = variants.length === 1 ? variants[0].price : defaultPrice;
    addToCart({ id: product.id, variantId: vId, name: product.product_name, price: parseFloat(finalPrice) });
    return;
  }
  showVariantPicker(product);
}

function showVariantPicker(product) {
  const old = document.getElementById("variant_picker_overlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "variant_picker_overlay";
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:9999;`;

  const box = document.createElement("div");
  box.className = "modal_content variant_picker_box";

  box.innerHTML = `
    <h2 style="color:var(--color-primary);font-size:18px;margin:0;text-align:center">${product.product_name}</h2>
    <p style="color:var(--color-subtext);font-size:13px;text-align:center;margin:0 0 10px 0">اختر الحجم أو النوع</p>
  `;

  product.variants.forEach(v => {
    const btn = document.createElement("button");
    btn.className = "variant_choice_btn";
    btn.innerHTML = `<span>${v.name}</span><span style="color:var(--color-primary)">${parseFloat(v.price)} ج.م</span>`;
    btn.onclick = () => {
      addToCart({ id: product.id, variantId: v.id, name: `${product.product_name} - ${v.name}`, price: parseFloat(v.price) });
      overlay.remove();
    };
    box.appendChild(btn);
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "تراجع";
  cancelBtn.className = "variant_cancel_btn";
  cancelBtn.onclick = () => overlay.remove();
  box.appendChild(cancelBtn);

  overlay.appendChild(box);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

// ===================================================
//  Cart Management
// ===================================================
function addToCart(item) {
  const uniqId = item.id + "_" + (item.variantId || 'null');
  const existing = cart.find(c => c.uniqId === uniqId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ uniqId, item, qty: 1 });
  }
  updateCartUI();
  showToast("تمت الإضافة للسلة!");
}

function updateQty(uniqId, delta) {
  const current = cart.find(c => c.uniqId === uniqId);
  if (!current) return;
  current.qty += delta;
  if(current.qty <= 0) {
    cart = cart.filter(c => c.uniqId !== uniqId);
  }
  updateCartUI();
}

function updateCartUI(options = {}) {
  const badge = document.getElementById("cart_badge");
  const modalList = document.getElementById("cart_items_container");
  const totalEl = document.getElementById("cart_total_price");
  const subtotalEl = document.getElementById("cart_subtotal_price");
  const discountRow = document.getElementById("cart_discount_row");
  const discountEl = document.getElementById("cart_discount_price");
  
  const totalQty = cart.reduce((acc, c) => acc + c.qty, 0);
  const totalPrice = cart.reduce((acc, c) => acc + (c.item.price * c.qty), 0);
  if (selectedOffer && !options.preservePricing) pricingPreview = calculateOfferLocally(selectedOffer);
  
  badge.textContent = totalQty;
  const discount = selectedOffer ? Number(pricingPreview.discount_amount || 0) : 0;
  const finalTotal = Math.max(0, selectedOffer && pricingPreview.total_amount ? Number(pricingPreview.total_amount) : totalPrice - discount);
  subtotalEl.textContent = `${totalPrice.toFixed(2)} ج.م`;
  discountRow.hidden = discount <= 0;
  discountEl.textContent = `- ${discount.toFixed(2)} ج.م`;
  totalEl.textContent = `${finalTotal.toFixed(2)} ج.م`;
  updateSelectedOfferUI();
  
  if (cart.length === 0) {
    modalList.innerHTML = `<p style="text-align:center;color:var(--color-subtext)">السلة فارغة</p>`;
    document.getElementById("next_step_btn").style.display = "none";
    goToStep1(); // Always go back to step 1 if empty
    pricingPreview = { discount_amount: 0, total_amount: 0 };
    return;
  }
  
  document.getElementById("next_step_btn").style.display = "block";
  
  modalList.innerHTML = "";
  cart.forEach(c => {
    const itemOffers = selectedOffer ? [] : offersForProduct(c.item.id);
    const row = document.createElement("div");
    row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;";
    row.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:bold;font-size:14px;">${c.item.name}</div>
        <div style="color:var(--color-primary);font-size:13px;">${(c.item.price * c.qty).toFixed(2)} ج.م</div>
        ${itemOffers.length ? `<div class="cart_item_offers">${itemOffers.map(offer => `<button type="button" class="cart_offer_btn" onclick="selectOffer(${Number(offer.offer_id)}, true)">تطبيق ${escapeHtml(offer.display_name || offerValueLabel(offer))}</button>`).join("")}</div>` : ""}
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="updateQty('${c.uniqId}', -1)" style="background:transparent;border:1px solid #e40411;color:#e40411;width:28px;height:28px;border-radius:4px;cursor:pointer;">-</button>
        <span style="font-weight:bold;width:15px;text-align:center;">${c.qty}</span>
        <button onclick="updateQty('${c.uniqId}', 1)" style="background:var(--color-primary);border:none;color:#000;width:28px;height:28px;border-radius:4px;font-weight:bold;cursor:pointer;">+</button>
      </div>
    `;
    modalList.appendChild(row);
  });
  if (!options.skipPreview) schedulePricingPreview();
}

function calculateOfferLocally(offer) {
  const subtotal = cart.reduce((sum, entry) => sum + Number(entry.item.price) * entry.qty, 0);
  const rules = offer.rules || {};
  const directIds = (offer.product_ids || []).map(Number);
  const categoryIds = (rules.category_ids || []).map(Number);
  const eligible = cart.filter(entry => {
    const product = products.find(item => Number(item.id) === Number(entry.item.id));
    if (directIds.length) return directIds.includes(Number(entry.item.id));
    if (categoryIds.length) return categoryIds.includes(Number(product?.cat_id));
    return true;
  });
  const eligibleSubtotal = eligible.reduce((sum, entry) => sum + Number(entry.item.price) * entry.qty, 0);
  const eligibleQty = eligible.reduce((sum, entry) => sum + entry.qty, 0);
  const value = Number(offer.discount_value || 0);
  let discount = 0;
  if (subtotal < Number(offer.min_order_amount || 0) || eligibleQty < Number(offer.min_quantity || 0)) return { discount_amount: 0, total_amount: subtotal };
  if (offer.discount_type === "fixed") discount = Math.min(value, eligibleSubtotal);
  else if (["percentage", "happy_hour"].includes(offer.discount_type)) discount = eligibleSubtotal * value / 100;
  else if (offer.discount_type === "category_discount") discount = rules.discount_mode === "fixed" ? Math.min(value, eligibleSubtotal) : eligibleSubtotal * value / 100;
  else if (offer.discount_type === "quantity_discount" && eligibleQty >= Number(rules.quantity_required || 1)) discount = eligibleSubtotal * value / 100;
  else if (offer.discount_type === "combo" && rules.requirements?.length) {
    const bundleCount = Math.min(...rules.requirements.map(req => Math.floor((cart.find(entry => Number(entry.item.id) === Number(req.product_id))?.qty || 0) / Number(req.quantity || 1))));
    const bundleRegular = rules.requirements.reduce((sum, req) => sum + Number(cart.find(entry => Number(entry.item.id) === Number(req.product_id))?.item.price || 0) * Number(req.quantity || 1), 0);
    discount = Math.max(0, bundleRegular - Number(rules.combo_price || 0)) * Math.max(0, bundleCount);
  } else if (offer.discount_type === "buy_x_get_y") {
    const buyQty = Math.max(1, Number(rules.buy_quantity || 1));
    const bought = cart.filter(entry => (rules.buy_product_ids || []).map(Number).includes(Number(entry.item.id))).reduce((sum, entry) => sum + entry.qty, 0);
    let rewards = Math.floor(bought / buyQty) * Math.max(1, Number(rules.get_quantity || 1));
    const rewardItems = cart.filter(entry => (rules.get_product_ids || []).map(Number).includes(Number(entry.item.id))).sort((a, b) => a.item.price - b.item.price);
    for (const entry of rewardItems) { const qty = Math.min(entry.qty, rewards); discount += qty * entry.item.price * Number(rules.reward_percent ?? 100) / 100; rewards -= qty; if (rewards <= 0) break; }
  } else if (offer.discount_type === "buy_one_get_one") {
    discount = [...eligible].sort((a, b) => a.item.price - b.item.price).reduce((sum, entry) => sum + Math.floor(entry.qty / 2) * entry.item.price, 0);
  }
  if (offer.max_discount_amount) discount = Math.min(discount, Number(offer.max_discount_amount));
  discount = Math.max(0, Math.min(discount, subtotal));
  return { discount_amount: discount, total_amount: subtotal - discount };
}

function schedulePricingPreview(immediate = false) {
  clearTimeout(pricingTimer);
  if (!selectedOffer || cart.length === 0) return;
  const phone = (document.getElementById("cust_phone")?.value || "").replace(/\D/g, "");
  if (!/^01\d{9}$/.test(phone)) return;
  pricingTimer = setTimeout(previewSelectedOffer, immediate ? 0 : 700);
}

async function previewSelectedOffer() {
  if (!selectedOffer || cart.length === 0) return;
  try {
    const response = await fetch(`${API_BASE}/pricing/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map(entry => ({ product_id: Number(entry.item.id), quantity: Number(entry.qty), unit_price: Number(entry.item.price) })),
        order_type: document.getElementById("cust_order_type")?.value || "delivery",
        source: "online",
        delivery_fee: 0,
        offer_code: selectedOffer.code,
        customer_phone: (document.getElementById("cust_phone")?.value || "").trim()
      })
    });
    if (!response.ok) throw new Error("Offer is not applicable");
    pricingPreview = await response.json();
    updateCartUI({ skipPreview: true, preservePricing: true });
  } catch (error) {
    pricingPreview = calculateOfferLocally(selectedOffer);
    updateCartUI({ skipPreview: true });
  }
}

// ===================================================
//  Checkout
// ===================================================
// ===================================================
//  Step Navigation
// ===================================================
function goToStep2() {
  if (cart.length === 0) return;
  document.getElementById("cart_step_1").style.display = "none";
  document.getElementById("cart_step_2").style.display = "flex";
}

function goToStep1() {
  document.getElementById("cart_step_2").style.display = "none";
  document.getElementById("cart_step_1").style.display = "flex";
}

// ===================================================
//  Checkout Submission
// ===================================================
function submitFinalOrder() {
  // Validate form
  const name = document.getElementById("cust_name").value.trim();
  const phone = document.getElementById("cust_phone").value.trim();
  const type = document.getElementById("cust_order_type").value;
  const addr = document.getElementById("cust_addr").value.trim();

  const notes = (document.getElementById("cust_order_notes")?.value || "").trim();

  if (!name || !phone) {
    showToast("يرجى إدخال الاسم ورقم الهاتف", "error");
    return;
  }
  
  if (type === "delivery" && !addr) {
    showToast("يرجى إدخال العنوان للتوصيل", "error");
    return;
  }

  // Show custom warning modal instead of browser alert
  document.getElementById("warning_modal").style.display = "flex";

  // Handle confirmation in the modal
  document.getElementById("confirm_warning_btn").onclick = function() {
    closeWarningModal();
    submitOrder({ name, phone, type, addr, notes });
  };
}

function closeWarningModal() {
  document.getElementById("warning_modal").style.display = "none";
}

async function submitOrder(custInfo) {
  const btn = document.getElementById("checkout_btn");
  const originalText = btn.textContent;
  btn.textContent = "جاري الإرسال...";
  btn.disabled = true;

  try {
    let customerId = 0;
    let addressId = 0;

    // 1. Fetch or Create Customer
    try {
      const getCustRes = await fetch(`${API_BASE}/customers/by-phone/${custInfo.phone}`);
      if (getCustRes.ok) {
        const custData = await getCustRes.json();
        customerId = custData.id;
      } else {
        // Create new
        const postCustRes = await fetch(`${API_BASE}/orders/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: custInfo.name, phone_number: custInfo.phone })
        });
        if (postCustRes.ok) {
          const newCust = await postCustRes.json();
          customerId = newCust.id;
        }
      }
    } catch(err) {
      console.warn("Could not fetch/create customer, proceeding as guest", err);
    }

    // 2. Save Address if delivery
    if (customerId > 0 && custInfo.type === 'delivery' && custInfo.addr) {
      try {
        const postAddrRes = await fetch(`${API_BASE}/orders/${customerId}/addresses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: custInfo.addr })
        });
        if (postAddrRes.ok) {
          const newAddr = await postAddrRes.json();
          addressId = newAddr.id;
        }
      } catch (err) {
        console.warn("Could not save address to customer, using notes.", err);
      }
    }

    const payload = {
      customer_id: customerId > 0 ? customerId : null,
      customer_phone: custInfo.phone,
      customer_name: custInfo.name,
      order_type: custInfo.type, // 'delivery' or 'takeaway'
      source: "online",
      customer_notes: custInfo.notes || null,
      customer_address: custInfo.type === 'delivery' ? custInfo.addr : null,
      address: custInfo.type === 'delivery' ? custInfo.addr : null,
      internal_notes: "",
      items: cart.map(c => ({
        product_id: parseInt(c.item.id),
        quantity: parseInt(c.qty),
        unit_price: parseFloat(c.item.price)
      })),
      idempotency_key: "web_" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
      address_id: addressId > 0 ? addressId : null,
      delivery_person_id: null,
      delivery_fee: 0,
      offer_code: selectedOffer?.code || null
    };

    const res = await fetch(`${API_BASE}/orders/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("API Error Response:", errData);

      const apiDetail = String(errData.detail || errData.message || "");
      const offerUsageExhausted = /استنفد عدد مرات استخدام العرض|global usage limit reached|no longer active or has expired/i.test(apiDetail);
      if (selectedOffer && offerUsageExhausted) {
        const personalLimit = /استنفد عدد مرات استخدام العرض/i.test(apiDetail);
        showToast(
          personalLimit
            ? "لقد استنفدت عدد مرات استخدام هذا العرض. يمكنك إلغاء العرض وإتمام الطلب بالسعر العادي."
            : "عذراً، تم استنفاد عدد مرات استخدام هذا العرض ولم يعد متاحاً.",
          "error",
          6000
        );
        return;
      }

      // per user request: if any error happens during submission (especially when closed), 
      // show the "wait 15 minutes" message.
      const errMsg = "عذراً، استقبال الطلبات ممتنع حالياً. يرجى الانتظار لمدة ربع ساعة والمحاولة مرة أخرى.";
      showToast(errMsg, "error");
      return;
    }

    // Success
    const orderResult = await res.json();
    const orderNumber = orderResult.order_number || orderResult.id || null;

    cart = [];
    updateCartUI();
    goToStep1(); 
    document.getElementById("cart_modal").style.display = "none";
    
    // إظهار بوب-أب رقم الطلب
    showOrderConfirmPopup(orderNumber);
    
    // Trigger rating modal after closing popup
    // (يتم استدعاؤه من داخل showOrderConfirmPopup)

  } catch (e) {
    showToast("عذراً، حدثت مشكلة أثناء إرسال الطلب", "error");
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ===================================================
//  Utils
// ===================================================
function showToast(message, type = 'success', duration = 2800) {
  const existing = document.getElementById("toast_msg_dynamic");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "toast_msg_dynamic";
  el.className = "toast_msg";
  el.textContent = message;
  
  if(type === 'error') {
     el.style.background = "#e40411";
  }

  document.body.appendChild(el);
  setTimeout(() => {
    if(el.parentElement) el.remove();
  }, duration);
}

// ===================================================
//  Order Confirm Popup (رقم الطلب)
// ===================================================
function showOrderConfirmPopup(orderNumber) {
  const old = document.getElementById("order_confirm_popup");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "order_confirm_popup";
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    z-index: 99999;
    animation: fadeInOverlay 0.3s ease;
  `;

  if (!document.getElementById("popup_keyframes")) {
    const styleEl = document.createElement("style");
    styleEl.id = "popup_keyframes";
    styleEl.textContent = `
      @keyframes fadeInOverlay { from { opacity:0; } to { opacity:1; } }
      @keyframes popIn { from { transform: scale(0.8); opacity:0; } to { transform: scale(1); opacity:1; } }
    `;
    document.head.appendChild(styleEl);
  }

  const numericOrderNumber = String(orderNumber ?? "").replace(/\D/g, "");
  const orderLabel = numericOrderNumber || "—";

  const box = document.createElement("div");
  box.style.cssText = `
    background: linear-gradient(135deg, #1a1208 0%, #0f0c06 100%);
    border: 1px solid rgba(201,168,76,0.4);
    border-radius: 20px;
    padding: 36px 28px;
    min-width: 300px;
    max-width: 90vw;
    text-align: center;
    direction: rtl;
    box-shadow: 0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(201,168,76,0.1);
    animation: popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
  `;

  box.innerHTML = `
    <div style="font-size:52px; margin-bottom:14px; line-height:1;">🎉</div>
    <h2 style="color:#C9A84C; font-size:22px; margin:0 0 8px 0; font-family:Marhey,sans-serif;">تم استلام طلبك!</h2>
    <p style="color:rgba(255,255,255,0.65); font-size:14px; margin:0 0 24px 0; line-height:1.6;">
      سيتم التواصل معك قريباً لتأكيد الطلب
    </p>

    <div style="
      background: rgba(201,168,76,0.1);
      border: 1px dashed rgba(201,168,76,0.5);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
    ">
      <p style="color:rgba(255,255,255,0.5); font-size:12px; margin:0 0 6px 0;">رقم طلبك</p>
      <p style="color:#C9A84C; font-size:32px; font-weight:900; margin:0; letter-spacing:2px; font-family:Cairo,sans-serif;">${orderLabel}</p>
    </div>

    <p style="color:rgba(255,255,255,0.4); font-size:12px; margin:0 0 20px 0;">احتفظ بهذا الرقم للمتابعة</p>

    <button id="popup_close_btn" style="
      width: 100%;
      padding: 13px;
      background: linear-gradient(135deg, #C9A84C, #a07c28);
      color: #000;
      border: none;
      border-radius: 10px;
      font-family: Marhey, Cairo, sans-serif;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.2s;
    " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">حسناً، شكراً!</button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("popup_close_btn").onclick = () => {
    overlay.remove();
    // فتح مودال التقييم بعد إغلاق البوب-أب
    setTimeout(() => openPostOrderModal(), 500);
  };

  // إغلاق بالضغط خارج البوكس
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      setTimeout(() => openPostOrderModal(), 500);
    }
  };
}

// ===================================================
//  Mobile Menu Toggle
// ===================================================
const mobileMenuBtn = document.getElementById("mobile_menu_btn");
const navLinks = document.getElementById("nav_links");

if (mobileMenuBtn && navLinks) {
  mobileMenuBtn.addEventListener("click", () => {
    mobileMenuBtn.classList.toggle("active");
    navLinks.classList.toggle("active");
  });

  // Close menu when clicking a link
  document.querySelectorAll(".nav_link").forEach(link => {
    link.addEventListener("click", () => {
      mobileMenuBtn.classList.remove("active");
      navLinks.classList.remove("active");
    });
  });
}

// ===================================================
//  Reviews & Ratings Logic
// ===================================================
const MOCK_REVIEWS = [
  { name: "توب شيف", rating: 5, text: "شكراً لزيارتكم! نحن نعمل دائماً على تقديم الأفضل لكم." }
];

async function loadReviews(isLoadMore = false) {
  try {
    if (!isLoadMore) {
      currentReviewsPage = 1;
      reviews = [];
    }

    const res = await fetch(`${API_BASE}/comments/?page=${currentReviewsPage}&page_size=${REVIEWS_PAGE_SIZE}`);
    if (res.ok) {
      const data = await res.json();
      
      // Store summary info
      reviewsSummary.total = data.total || 0;
      reviewsSummary.average_rating = data.average_rating || 0;
      
      // Handle the comments list
      const commentList = Array.isArray(data.comments) ? data.comments : [];
      const newReviews = commentList.map(c => ({
        name: c.full_name || "عميل بدون اسم",
        rating: Math.max(1, Math.min(5, c.stars || 5)),
        text: c.comment_text || ""
      }));

      reviews = isLoadMore ? [...reviews, ...newReviews] : newReviews;
      
      // Show/Hide "Load More" button
      const paginationContainer = document.getElementById("reviews_pagination");
      if (paginationContainer) {
        paginationContainer.style.display = (reviews.length < reviewsSummary.total) ? "block" : "none";
      }
    } else {
      throw new Error("Failed to load reviews");
    }
  } catch(err) {
    console.warn("Could not fetch reviews, using fallback", err);
    if (!isLoadMore) {
        reviews = MOCK_REVIEWS;
        reviewsSummary.total = reviews.length;
        reviewsSummary.average_rating = 5;
    }
  }
  renderReviews();
  renderAvgSummary();
}

async function loadMoreReviews() {
  currentReviewsPage++;
  const btn = document.querySelector(".load_more_btn");
  if (btn) {
    btn.textContent = "جاري التحميل...";
    btn.disabled = true;
  }
  
  await loadReviews(true);
  
  if (btn) {
    btn.textContent = "عرض المزيد من الآراء";
    btn.disabled = false;
  }
}

function renderAvgSummary() {
  const avg = reviewsSummary.average_rating || 0;
  const total = reviewsSummary.total || 0;

  const avgValueEl = document.getElementById("avg_rating_value");
  const totalCountEl = document.getElementById("total_reviews_count");

  if (avgValueEl) avgValueEl.textContent = avg.toFixed(1);
  if (totalCountEl) totalCountEl.textContent = `(${total}+ تقييم)`;
  
  const starContainer = document.getElementById("avg_stars");
  if (starContainer) {
    starContainer.innerHTML = Array(5).fill(0).map((_, i) => `
      <svg class="star_icon ${i < Math.round(avg) ? '' : 'empty'}" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    `).join("");
  }
}

function renderReviews() {
  const container = document.getElementById("reviews_container");
  if (!container) return; // Reviews section might be optional on some pages
  
  container.innerHTML = reviews.map(r => `
    <div class="review_card">
      <div class="review_user">
        <div class="user_avatar">${(r.name && r.name.length > 0) ? r.name.charAt(0) : 'E'}</div>
        <div class="user_info">
          <h4>${r.name || "Customer"}</h4>
          <div class="stars_row">
            ${Array(5).fill(0).map((_, i) => `
              <svg class="star_icon ${i < r.rating ? '' : 'empty'}" style="width:14px;height:14px;" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            `).join("")}
          </div>
        </div>
      </div>
      <p class="review_text">${r.text}</p>
    </div>
  `).join("");
}

function renderInteractiveStars(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = Array(5).fill(0).map((_, i) => `
    <svg class="star_input ${i < selectedRating ? 'active' : ''}" data-index="${i+1}" viewBox="0 0 24 24" onclick="setRating(${i+1}, '${containerId}')">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  `).join("");
}

function setRating(n, containerId) {
  selectedRating = n;
  renderInteractiveStars(containerId);
}

// Manual Review Modals
function openAddReviewModal() {
  selectedRating = 0;
  document.getElementById("review_name").value = "";
  document.getElementById("review_text").value = "";
  document.getElementById("review_modal").style.display = "flex";
  renderInteractiveStars("review_stars");
}

function closeReviewModal() {
  document.getElementById("review_modal").style.display = "none";
}

async function submitManualReview() {
  const name = document.getElementById("review_name").value.trim();
  const text = document.getElementById("review_text").value.trim();
  
  if (!name || selectedRating === 0 || !text) {
    showToast("يرجى إكمال جميع الحقول واختيار التقييم", "error");
    return;
  }
  
  try {
    const btn = document.querySelector("#review_modal .checkout_btn");
    const origText = btn.textContent;
    btn.textContent = "جاري الحفظ...";
    btn.disabled = true;

    await fetch(`${API_BASE}/comments/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: name,
        stars: selectedRating,
        comment_text: text
      })
    });
    
    // Refresh reviews from server to get accurate summary
    await loadReviews();
    
    closeReviewModal();
    showToast("شكراً لمشاركتك رأيك! تم نشر التقييم بنجاح.");
    
    btn.textContent = origText;
    btn.disabled = false;
  } catch(err) {
    console.error(err);
    showToast("عذراً، حدث خطأ أثناء إرسال التقييم", "error");
  }
}

// Post-Order Feedback
function openPostOrderModal() {
  selectedRating = 0;
  document.getElementById("post_comment").value = "";
  document.getElementById("post_order_modal").style.display = "flex";
  renderInteractiveStars("post_stars");
}

function closePostOrderModal() {
  document.getElementById("post_order_modal").style.display = "none";
}

async function submitPostOrderRating() {
  if (selectedRating === 0) {
    showToast("يرجى اختيار عدد النجوم للتقييم", "error");
    return;
  }
  
  const comment = document.getElementById("post_comment").value.trim();
  const userName = lastEnteredName;
  
  try {
    const btn = document.querySelector("#post_order_modal button:nth-child(2)");
    if(btn) { btn.textContent = "جاري الحفظ..."; btn.disabled = true; }

    await fetch(`${API_BASE}/comments/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: userName,
        stars: selectedRating,
        comment_text: comment || "تجربة رائعة وخدمة ممتازة"
      })
    });

    // Refresh reviews from server
    await loadReviews();

    closePostOrderModal();
    showToast("شكراً جزيلاً لتقييمك! نسعد دائماً بآرائكم.");
  } catch(err) {
    console.error(err);
    showToast("عذراً، حدث خطأ أثناء إرسال التقييم", "error");
  }
}

// Modified Submit logic to save last customer name temporarily
const originalSubmitFinalOrder = submitFinalOrder;
submitFinalOrder = async function() {
  const name = document.getElementById("cust_name").value.trim();
  if (name) lastEnteredName = name;
  return originalSubmitFinalOrder.apply(this, arguments);
};

// Boot
init();
