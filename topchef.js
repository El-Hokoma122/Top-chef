let SHEET_ID = '1Hu-myznrdv38sdi4AbV2CwzgyJhwCXIBQDWcgxSwewY';
let SHEET_TITLE = 'topchef';
let SHEET_RANGE = 'topchef!A:F';

let FULL_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?sheet=' + SHEET_TITLE + '&range=' + SHEET_RANGE;

async function main() {
    try {
        const res = await fetch(FULL_URL);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const text = await res.text();
        const data = JSON.parse(text.substring(47).slice(0, -2))
            .table.rows.slice(1)
            .map(row => row.c.map(cell => cell?.v || null));

        console.log('Data from Google Sheets:', data); // Print the data to the console

        function createProductCard(row) {
            const productName = row[0]; 
            const productCategory = row[1]; 
            const productPrice = row[2]; 
            const productImage = row[3]; 
            const productDescription = row[4]; 
            const productId = `product-${productName.replace(/\s+/g, '-').toLowerCase()}`; // إنشاء ID بناءً على الاسم

            const div = document.createElement('div');
            div.classList.add('special__card');
            div.id = productId; 

            div.innerHTML = `
                <img src="${productImage}" alt="${productName}" />
                <h4 class="product-title">${productName}</h4>
                <p>${productDescription}</p>
                <div class="special__ratings">
                    <span><i class="ri-star-fill"></i></span>
                    <span><i class="ri-star-fill"></i></span>
                    <span><i class="ri-star-fill"></i></span>
                    <span><i class="ri-star-fill"></i></span>
                    <span><i class="ri-star-fill"></i></span>
                </div>
                <div class="special__footer">
                    <p class="price">${productPrice}</p>
                    <button class="btn">أطلب أوردرك</button>
                </div>
            `;
            return { element: div, category: productCategory };
        }

        function createSectionIfNotExists(category) {
            if (!category) return null; // Return null if category is invalid

            let sectionId = `section-${category.replace(/\s+/g, '-').toLowerCase()}`;
            let existingSection = document.getElementById(sectionId);

            if (!existingSection) {
                const section = document.createElement('section');
                section.classList.add('section__container');
                section.id = sectionId;

                section.innerHTML = `
                    <h2 class="section__header">${category}</h2>
                    <div class="special__grid"></div>
                `;

                const sectionMenu = document.querySelector('.section__menu');
                if (sectionMenu) {
                    sectionMenu.appendChild(section);
                } else {
                    document.body.appendChild(section);
                }
                return section.querySelector('.special__grid');
            }

            return existingSection.querySelector('.special__grid');
        }

        data.forEach(row => {
            const { element, category } = createProductCard(row);
            let sectionContainer = createSectionIfNotExists(category);
            if (sectionContainer) {
                sectionContainer.appendChild(element);
            }
        });
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

main();

const menuBtn = document.getElementById("menu-btn");
const navLinks = document.getElementById("nav-links");
const menuBtnIcon = menuBtn.querySelector("i");
menuBtn.addEventListener("click", (e) => {
  navLinks.classList.toggle("open");

  const isOpen = navLinks.classList.contains("open");
  menuBtnIcon.setAttribute("class", isOpen ? "ri-close-line" : "ri-menu-line");
});
navLinks.addEventListener("click", (e) => {
  navLinks.classList.remove("open");
  menuBtnIcon.setAttribute("class", "ri-menu-line");
});
const scrollRevealOption = {
  distance: "50px",
  origin: "bottom",
  duration: 1000,
};
ScrollReveal().reveal(".header__image img", {
  ...scrollRevealOption,
  origin: "right",
});
ScrollReveal().reveal(".header__content h1", {
  ...scrollRevealOption,
  delay: 500,
});
ScrollReveal().reveal(".header__content .section__description", {
  ...scrollRevealOption,
  delay: 1000,
});
ScrollReveal().reveal(".header__content .header__btn", {
  ...scrollRevealOption,
  delay: 1500,
});
ScrollReveal().reveal(".explore__image img", {
  ...scrollRevealOption,
  origin: "left",
});
ScrollReveal().reveal(".explore__content .section__header", {
  ...scrollRevealOption,
  delay: 500,
});
ScrollReveal().reveal(".explore__content .section__description", {
  ...scrollRevealOption,
  delay: 1000,
});
ScrollReveal().reveal(".explore__content .explore__btn", {
  ...scrollRevealOption,
  delay: 1500,
});
ScrollReveal().reveal(".banner__card", {
  ...scrollRevealOption,
  interval: 500,
});
ScrollReveal().reveal(".chef__image img", {
  ...scrollRevealOption,
  origin: "right",
});
ScrollReveal().reveal(".chef__content .section__header", {
  ...scrollRevealOption,
  delay: 500,
});
ScrollReveal().reveal(".chef__content .section__description", {
  ...scrollRevealOption,
  delay: 1000,
});
ScrollReveal().reveal(".chef__list li", {
  ...scrollRevealOption,
  delay: 1500,
  interval: 500,
});
const swiper = new Swiper(".swiper", {
  loop: true,

  pagination: {
    el: ".swiper-pagination",
  },
});