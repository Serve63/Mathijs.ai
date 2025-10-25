const header = document.querySelector(".top-nav");
const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
const desktopLinks = document.querySelectorAll(".primary-nav a");
const mobileLinks = document.querySelectorAll(".mobile-nav a");

const sections = [...document.querySelectorAll("main section")];

const closeMobileNav = () => {
  if (!mobileNav) return;
  mobileNav.classList.remove("active");
  if (menuToggle) {
    menuToggle.setAttribute("aria-expanded", "false");
  }
};

const setActiveLink = (id) => {
  const updateSet = (links) => {
    links.forEach((link) => {
      const target = link.getAttribute("href");
      if (target === `#${id}`) {
        link.classList.add("is-active");
      } else {
        link.classList.remove("is-active");
      }
    });
  };
  updateSet(desktopLinks);
  updateSet(mobileLinks);
};

if (menuToggle && mobileNav) {
  menuToggle.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("active");
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

mobileLinks.forEach((link) => {
  link.addEventListener("click", () => {
    closeMobileNav();
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry) => {
        setActiveLink(entry.target.id);
      });
  },
  {
    rootMargin: "-50% 0px -40% 0px",
    threshold: 0.05,
  }
);

sections.forEach((section) => {
  if (section.id) {
    observer.observe(section);
  }
});

let lastScrollY = window.scrollY;

const handleScroll = () => {
  const current = window.scrollY;
  if (header) {
    if (current > 20) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }
  lastScrollY = current;
};

document.addEventListener("scroll", handleScroll, { passive: true });
handleScroll();

document.addEventListener("click", (event) => {
  if (!mobileNav || !menuToggle) return;
  if (
    mobileNav.contains(event.target) ||
    menuToggle.contains(event.target) ||
    !mobileNav.classList.contains("active")
  ) {
    return;
  }
  closeMobileNav();
});

