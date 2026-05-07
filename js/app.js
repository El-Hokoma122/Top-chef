const API_BASE = "https://topchef-system.fastapicloud.dev";

// ===================================================
//  State
// ===================================================
let categories = [];
let products = [];
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
    const [catsRes, prodsRes] = await Promise.all([
      fetch(`${API_BASE}/menu/categories`),
      fetch(`${API_BASE}/menu/products`)
    ]);

    if (!catsRes.ok || !prodsRes.ok) throw new Error("API error loading menu");

    const fetchedCategories = await catsRes.json();
    const fetchedProducts = await prodsRes.json();

    // Filter active categories and available products
    categories = Array.isArray(fetchedCategories) ? fetchedCategories.filter(c => c.is_active) : [];
    products = Array.isArray(fetchedProducts) ? fetchedProducts.filter(p => p.is_available) : [];

    if (categories.length > 0) {
      activeCatId = categories[0].id;
    }

    renderTabs();
    renderItems();
    loadReviews();
  } catch (err) {
    console.error("API Error:", err);
    document.getElementById("items_grid").innerHTML = `<p style="color:#e40411;text-align:center;grid-column:1/-1;">عذراً، حدث خطأ في تحميل المنيو. يرجى المحاولة لاحقاً.</p>`;
  }
}


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

function updateCartUI() {
  const badge = document.getElementById("cart_badge");
  const modalList = document.getElementById("cart_items_container");
  const totalEl = document.getElementById("cart_total_price");
  
  const totalQty = cart.reduce((acc, c) => acc + c.qty, 0);
  const totalPrice = cart.reduce((acc, c) => acc + (c.item.price * c.qty), 0);
  
  badge.textContent = totalQty;
  totalEl.textContent = `${totalPrice.toFixed(2)} ج.م`;
  
  if (cart.length === 0) {
    modalList.innerHTML = `<p style="text-align:center;color:var(--color-subtext)">السلة فارغة</p>`;
    document.getElementById("next_step_btn").style.display = "none";
    goToStep1(); // Always go back to step 1 if empty
    return;
  }
  
  document.getElementById("next_step_btn").style.display = "block";
  
  modalList.innerHTML = "";
  cart.forEach(c => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;";
    row.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:bold;font-size:14px;">${c.item.name}</div>
        <div style="color:var(--color-primary);font-size:13px;">${(c.item.price * c.qty).toFixed(2)} ج.م</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <button onclick="updateQty('${c.uniqId}', -1)" style="background:transparent;border:1px solid #e40411;color:#e40411;width:28px;height:28px;border-radius:4px;cursor:pointer;">-</button>
        <span style="font-weight:bold;width:15px;text-align:center;">${c.qty}</span>
        <button onclick="updateQty('${c.uniqId}', 1)" style="background:var(--color-primary);border:none;color:#000;width:28px;height:28px;border-radius:4px;font-weight:bold;cursor:pointer;">+</button>
      </div>
    `;
    modalList.appendChild(row);
  });
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
  document.getElementById("cart_step_2").style.display = "block";
}

function goToStep1() {
  document.getElementById("cart_step_2").style.display = "none";
  document.getElementById("cart_step_1").style.display = "block";
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
      offer_code: null
    };

    const res = await fetch(`${API_BASE}/orders/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("API Error Response:", errData);
      
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
function showToast(message, type = 'success') {
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
  }, 2800);
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

  const orderLabel = orderNumber ? `#${orderNumber}` : "—";

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
