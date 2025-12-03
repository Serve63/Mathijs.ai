const SUPABASE_URL = "https://mengrlsqgshxqcxhirjn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PeVTrMXz6UaeMhkPn5Fs-Q_xfJFVRNt";

let cachedSupabaseClient = null;

const initializeSupabaseClient = () => {
  if (cachedSupabaseClient) {
    return cachedSupabaseClient;
  }
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.warn("Supabase library is niet beschikbaar op deze pagina.");
    return null;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Supabase configuratie ontbreekt, vul je URL en anon key in.");
    return null;
  }
  cachedSupabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.mathijsSupabase = cachedSupabaseClient;
  return cachedSupabaseClient;
};

initializeSupabaseClient();

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

