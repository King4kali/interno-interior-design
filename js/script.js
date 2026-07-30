(() => {
    "use strict";

    const root = document.documentElement;
    const motionStorageKey = "interno-motion";
    const reducedMotionQuery = (() => {
        try {
            return typeof window.matchMedia === "function"
                ? window.matchMedia("(prefers-reduced-motion: reduce)")
                : null;
        } catch {
            return null;
        }
    })();
    let reducedMotion = Boolean(reducedMotionQuery?.matches);
    const finePointer = (() => {
        try {
            return typeof window.matchMedia === "function"
                && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
        } catch {
            return false;
        }
    })();
    const storedMotion = (() => {
        try {
            const value = window.localStorage.getItem(motionStorageKey);
            return value === "on" || value === "off" ? value : null;
        } catch {
            return null;
        }
    })();
    const declaredMotion = root.dataset.motion === "on" || root.dataset.motion === "off"
        ? root.dataset.motion
        : null;
    let motionPreference = storedMotion || (reducedMotion ? "on" : declaredMotion) || "on";
    root.dataset.motion = reducedMotion ? "off" : motionPreference;
    const searchEntries = [
        {
            title: "Home",
            description: "Studio overview, featured work and client stories",
            url: "index.html",
            keywords: "home studio interior design"
        },
        {
            title: "About the studio",
            description: "Our point of view, values and design team",
            url: "about.html",
            keywords: "about team values story"
        },
        {
            title: "Interior design services",
            description: "Strategy, spatial planning, styling and delivery",
            url: "services.html",
            keywords: "services planning decoration renovation"
        },
        {
            title: "Signature interior service",
            description: "A detailed look at our full-service design process",
            url: "services-single.html",
            keywords: "service detail full service process video"
        },
        {
            title: "Featured projects",
            description: "Selected residential spaces by Interno",
            url: "index.html#projects",
            keywords: "projects portfolio kitchen living room"
        },
        {
            title: "Project packages",
            description: "Clear scopes and starting investments",
            url: "pricing.html",
            keywords: "pricing packages cost estimate"
        },
        {
            title: "Start a project",
            description: "Tell us about your space and prepare an enquiry",
            url: "#contact",
            keywords: "contact start brief email"
        }
    ];

    const state = {
        scrollFrame: null,
        toastTimer: null,
        revealReady: false,
        revealObserver: null,
        futureRevealObserver: null,
        motionHeadingObserver: null,
        motionHeadingFrame: null,
        sceneObserver: null,
        activeSections: new Set(),
        photoObserver: null,
        photoScenes: [],
        activePhotoScenes: new Set(),
        photoCompletion: new WeakMap(),
        motionSections: [],
        motionMedia: [],
        motionFrame: null,
        velocityTimer: null,
        previousScrollY: window.scrollY || 0,
        previousScrollTime: performance.now(),
        cursorFrame: null,
        cursor: null,
        cursorX: 0,
        cursorY: 0,
        cursorTargetX: 0,
        cursorTargetY: 0,
        cursorInitialized: false,
        pointerFrame: null,
        pendingPointer: null,
        lastMagnetic: null,
        lastSpotlight: null
    };

    function isMotionEnabled() {
        return !reducedMotion && root.dataset.motion === "on";
    }

    const genericRevealSelector =
        "[data-reveal]:not(.motion-heading):not(.motion-photo), " +
        "[data-image-reveal]:not(.motion-photo)";
    const scrollRevealObserverOptions = Object.freeze({
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.01
    });
    const headingRevealObserverOptions = Object.freeze({
        rootMargin: "0px 0px -9% 0px",
        threshold: 0.01
    });
    const photoRevealObserverOptions = Object.freeze({
        rootMargin: "0px 0px -8% 0px",
        threshold: [0, 0.01, 0.08, 0.2, 0.45, 0.7, 0.9]
    });

    function queryAll(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }

    function showRevealContent(scope = document, settle = false) {
        root.classList.remove("reveal-armed");
        queryAll("[data-reveal], [data-image-reveal]", scope).forEach((element) => {
            element.classList.remove("is-reveal-prepared", "is-reveal-active");
            if (!element.classList.contains("is-visible")) {
                element.classList.add("is-visible");
            }
            if (settle) {
                element.classList.add("is-motion-settled", "is-reveal-complete");
                element.dataset.revealState = "complete";
            }
        });
    }

    function nextFrame(callback) {
        if (typeof window.requestAnimationFrame === "function") {
            return window.requestAnimationFrame(callback);
        }
        return window.setTimeout(callback, 16);
    }

    function createInterface() {
        const progress = document.createElement("div");
        progress.className = "scroll-progress";
        progress.setAttribute("aria-hidden", "true");
        document.body.prepend(progress);

        const curtain = document.createElement("div");
        curtain.className = "page-curtain";
        curtain.setAttribute("aria-hidden", "true");
        curtain.innerHTML = `
            <span class="page-curtain__panels">
                <span class="page-curtain__panel page-curtain__panel--one"></span>
                <span class="page-curtain__panel page-curtain__panel--two"></span>
            </span>
            <span class="page-curtain__line"></span>
            <span class="page-curtain__mark"><span class="mark">Interno</span></span>
        `;
        document.body.append(curtain);

        const toast = document.createElement("div");
        toast.className = "toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.append(toast);

        queryAll(".header-actions").forEach((actions) => {
            if (actions.querySelector("[data-motion-toggle]")) return;
            const button = document.createElement("button");
            button.className = "icon-button motion-toggle";
            button.type = "button";
            button.dataset.motionToggle = "";
            button.innerHTML = `
                <span class="motion-toggle__icon" aria-hidden="true">
                    <span></span><span></span><span></span>
                </span>
            `;
            const themeToggle = actions.querySelector("[data-theme-toggle]");
            actions.insertBefore(button, themeToggle || actions.firstChild);
        });

        queryAll(".mobile-menu__footer").forEach((footer) => {
            if (footer.querySelector("[data-motion-toggle]")) return;
            const button = document.createElement("button");
            button.className = "text-link motion-toggle motion-toggle--text motion-toggle--mobile";
            button.type = "button";
            button.dataset.motionToggle = "";
            button.innerHTML = `
                <span data-motion-label>Animations: on</span>
                <span class="motion-toggle__status" aria-hidden="true">On</span>
            `;
            footer.append(button);
        });

        const ambient = document.createElement("div");
        ambient.className = "motion-ambient";
        ambient.setAttribute("aria-hidden", "true");
        ambient.innerHTML = "<span></span><span></span><span></span>";
        document.body.append(ambient);

        const cursor = document.createElement("div");
        cursor.className = "motion-cursor";
        cursor.setAttribute("aria-hidden", "true");
        cursor.innerHTML = '<span class="motion-cursor__dot"></span>';
        document.body.append(cursor);
        state.cursor = cursor;

        createSearchDialog();
        createContactDialog();
        createProjectDialog();

        requestAnimationFrame(() => {
            document.documentElement.classList.add("is-ready");
        });
    }

    function clamp(value, minimum, maximum) {
        return Math.min(Math.max(value, minimum), maximum);
    }

    function splitMotionHeading(heading) {
        if (heading.dataset.motionSplit === "true") return;

        const accessibleText = heading.textContent.replace(/\s+/g, " ").trim();
        if (!accessibleText) return;

        const walker = document.createTreeWalker(
            heading,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;
                    if (parent.closest(".motion-word, [aria-hidden='true'], script, style")) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);

        let wordIndex = 0;
        textNodes.forEach((textNode) => {
            const fragment = document.createDocumentFragment();
            textNode.nodeValue.split(/(\s+)/).forEach((part) => {
                if (!part) return;
                if (/^\s+$/.test(part)) {
                    fragment.append(document.createTextNode(part));
                    return;
                }

                const word = document.createElement("span");
                const inner = document.createElement("span");
                word.className = "motion-word";
                inner.className = "motion-word__inner";
                word.style.setProperty("--word-index", String(wordIndex));
                word.setAttribute("aria-hidden", "true");
                inner.textContent = part;
                word.append(inner);
                fragment.append(word);
                wordIndex += 1;
            });
            textNode.replaceWith(fragment);
        });

        if (!heading.hasAttribute("aria-label")) {
            heading.setAttribute("aria-label", accessibleText);
        }
        const headingDelay = Number.parseInt(heading.dataset.delay || "0", 10);
        if (headingDelay) heading.style.setProperty("--motion-delay", `${headingDelay}ms`);
        heading.classList.add("motion-heading");
        if (isMotionEnabled()) {
            heading.classList.add("is-motion-heading-prepared");
            heading.dataset.motionHeadingState = "prepared";
        }
        heading.dataset.motionSplit = "true";
    }

    function prepareMotionHeadings() {
        queryAll("main .display, main .heading").forEach(splitMotionHeading);
    }

    function prepareRevealElement(element) {
        if (!element?.classList || element.classList.contains("is-visible")) return;
        element.classList.add("is-reveal-prepared");
        element.classList.remove("is-reveal-active", "is-reveal-complete");
        element.dataset.revealState = "prepared";
    }

    function settleRevealElement(element) {
        if (!element?.classList) return;
        element.classList.remove("is-reveal-prepared", "is-reveal-active", "is-photo-loading");
        element.classList.add("is-visible", "is-motion-settled", "is-reveal-complete");
        element.dataset.revealState = "complete";
    }

    function beginRevealElement(element) {
        if (!element?.classList) return;
        if (!isMotionEnabled()) {
            settleRevealElement(element);
            return;
        }
        if (
            element.classList.contains("is-reveal-active")
            || element.classList.contains("is-motion-settled")
            || element.dataset.revealState === "active"
            || element.dataset.revealState === "complete"
        ) {
            return;
        }
        element.classList.remove("is-reveal-prepared", "is-motion-settled", "is-reveal-complete");
        element.classList.add("is-reveal-active", "is-visible");
        element.dataset.revealState = "active";

        const delay = Number.parseInt(element.dataset.delay || "0", 10);
        const duration = element.hasAttribute("data-image-reveal") ? 1650 : 1250;
        const animationTarget = element.hasAttribute("data-image-reveal")
            ? element.querySelector("img")
            : element;
        let completionTimer = null;
        const complete = () => {
            window.clearTimeout(completionTimer);
            element.removeEventListener("animationend", handleAnimationEnd);
            element.classList.remove("is-reveal-active", "is-reveal-prepared");
            element.classList.add("is-motion-settled", "is-reveal-complete");
            element.dataset.revealState = "complete";
            element.dataset.motionSeen = "true";
        };
        const handleAnimationEnd = (event) => {
            const revealAnimations = new Set([
                "motion-reveal-up",
                "motion-reveal-left",
                "motion-reveal-right",
                "motion-reveal-scale",
                "motion-image-reveal-left",
                "motion-image-reveal-right"
            ]);
            if (event.target !== animationTarget || !revealAnimations.has(String(event.animationName || ""))) return;
            complete();
        };

        element.addEventListener("animationend", handleAnimationEnd);
        completionTimer = window.setTimeout(complete, delay + duration + 250);
    }

    function revealElementWhenReady(element, revealCallback) {
        const image = element.matches("[data-image-reveal]")
            ? element.querySelector("img")
            : null;
        if (!image || (image.complete && image.naturalWidth > 0)) {
            revealCallback(element);
            return;
        }
        if (element.dataset.revealWaiting === "true") return;

        element.dataset.revealWaiting = "true";
        element.classList.add("is-photo-loading");
        let timeout = null;
        const loaded = new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
        });
        const decoded = typeof image.decode === "function"
            ? image.decode().catch(() => loaded)
            : loaded;
        const safety = new Promise((resolve) => {
            timeout = window.setTimeout(resolve, 900);
        });

        Promise.race([decoded, loaded, safety]).then(() => {
            window.clearTimeout(timeout);
            delete element.dataset.revealWaiting;
            element.classList.remove("is-photo-loading");
            if (isMotionEnabled() && root.classList.contains("reveal-armed")) {
                revealCallback(element);
            } else {
                settleRevealElement(element);
            }
        });
    }

    function armMotionHeadingCompletion(heading) {
        if (!heading || heading.classList.contains("is-motion-heading-active")) return;
        const words = queryAll(".motion-word__inner", heading);
        if (!words.length) {
            heading.classList.add("is-motion-settled");
            heading.dataset.motionHeadingState = "settled";
            heading.dataset.motionSeen = "true";
            return;
        }

        heading.classList.add("is-motion-heading-active");
        heading.dataset.motionHeadingState = "active";
        const lastWord = words[words.length - 1];
        let completionTimer = null;
        const complete = () => {
            window.clearTimeout(completionTimer);
            lastWord.removeEventListener("animationend", handleAnimationEnd);
            heading.classList.remove("is-motion-heading-active", "is-motion-heading-prepared");
            heading.classList.add("is-motion-settled");
            heading.dataset.motionHeadingState = "settled";
            heading.dataset.motionSeen = "true";
        };
        const handleAnimationEnd = (event) => {
            if (event.animationName !== "motion-word-rise") return;
            complete();
        };

        lastWord.addEventListener("animationend", handleAnimationEnd);
        const extraDelay = heading.closest(".home-hero, .page-hero") ? 620 : 120;
        const declaredDelay = Number.parseInt(heading.dataset.delay || "0", 10);
        completionTimer = window.setTimeout(complete, declaredDelay + extraDelay + 1100 + words.length * 55);
    }

    function ensureFutureRevealObserver() {
        if (state.futureRevealObserver || typeof window.IntersectionObserver !== "function") return;
        state.futureRevealObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting || !isMotionEnabled()) return;
                    revealElementWhenReady(entry.target, beginRevealElement);
                    state.futureRevealObserver?.unobserve(entry.target);
                });
            },
            scrollRevealObserverOptions
        );
    }

    function prepareFutureReveals() {
        if (!isMotionEnabled()) return;
        ensureFutureRevealObserver();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        let pendingCount = 0;
        queryAll(genericRevealSelector).forEach((element) => {
            const bounds = element.getBoundingClientRect();
            if (element.dataset.motionSeen === "true") {
                element.classList.remove("is-reveal-prepared", "is-reveal-active");
                element.classList.add("is-visible", "is-motion-settled", "is-reveal-complete");
                element.dataset.revealState = "complete";
                return;
            }
            if (bounds.top > viewportHeight * 1.02) {
                element.classList.remove("is-visible", "is-motion-settled", "is-reveal-complete");
                prepareRevealElement(element);
                state.futureRevealObserver?.observe(element);
                pendingCount += 1;
            } else {
                element.classList.remove("is-reveal-prepared", "is-reveal-active");
                element.classList.add("is-visible", "is-motion-settled", "is-reveal-complete");
                element.dataset.revealState = "complete";
                element.dataset.motionSeen = "true";
            }
        });
        root.classList.toggle("reveal-armed", Boolean(state.futureRevealObserver && pendingCount));
    }

    function ensureMotionHeadingObserver() {
        if (state.motionHeadingObserver || typeof window.IntersectionObserver !== "function") return;
        state.motionHeadingObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    if (
                        !isMotionEnabled()
                        || entry.target.classList.contains("is-motion-settled")
                        || entry.target.dataset.motionHeadingState === "settled"
                    ) {
                        entry.target.classList.remove("is-motion-heading-prepared", "is-motion-heading-active");
                        entry.target.classList.add("is-motion-visible", "is-motion-settled");
                        entry.target.dataset.motionHeadingState = "settled";
                        state.motionHeadingObserver?.unobserve(entry.target);
                        return;
                    }
                    entry.target.classList.remove("is-motion-heading-prepared", "is-motion-settled");
                    entry.target.classList.add("is-motion-visible");
                    entry.target.dataset.motionHeadingState = "active";
                    armMotionHeadingCompletion(entry.target);
                    state.motionHeadingObserver?.unobserve(entry.target);
                });
            },
            headingRevealObserverOptions
        );
    }

    function activateMotionHeadings() {
        const headings = queryAll(".motion-heading");
        if (!isMotionEnabled() || typeof window.IntersectionObserver !== "function") {
            headings.forEach((heading) => {
                heading.classList.remove("is-motion-heading-prepared");
                heading.classList.add("is-motion-visible", "is-motion-settled");
                heading.dataset.motionHeadingState = "settled";
            });
            return;
        }

        ensureMotionHeadingObserver();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        headings.forEach((heading) => {
            const bounds = heading.getBoundingClientRect();
            if (heading.dataset.motionSeen === "true") {
                heading.classList.remove("is-motion-heading-prepared", "is-motion-heading-active");
                heading.classList.add("is-motion-visible", "is-motion-settled");
                heading.dataset.motionHeadingState = "settled";
                state.motionHeadingObserver?.unobserve(heading);
                return;
            }
            if (bounds.bottom < 0) {
                heading.classList.remove("is-motion-heading-prepared", "is-motion-heading-active");
                heading.classList.add("is-motion-visible", "is-motion-settled");
                heading.dataset.motionHeadingState = "settled";
                heading.dataset.motionSeen = "true";
                return;
            }
            if (bounds.top > viewportHeight * 1.02) {
                heading.classList.remove("is-motion-visible", "is-motion-settled", "is-motion-heading-active");
                heading.classList.add("is-motion-heading-prepared");
                heading.dataset.motionHeadingState = "prepared";
                state.motionHeadingObserver?.observe(heading);
                return;
            }
            if (heading.classList.contains("is-motion-settled")) {
                heading.classList.remove("is-motion-heading-prepared", "is-motion-heading-active");
                heading.classList.add("is-motion-visible");
                heading.dataset.motionHeadingState = "settled";
                heading.dataset.motionSeen = "true";
                state.motionHeadingObserver?.unobserve(heading);
                return;
            }
            if (!heading.classList.contains("is-motion-visible")) {
                heading.classList.add("is-motion-heading-prepared");
                heading.dataset.motionHeadingState = "prepared";
            }
            state.motionHeadingObserver?.observe(heading);
        });
        if (headings.some((heading) => heading.classList.contains("is-motion-heading-prepared"))) {
            root.classList.add("reveal-armed");
        }
    }

    function scheduleMotionHeadings() {
        if (state.motionHeadingFrame !== null) return;
        state.motionHeadingFrame = nextFrame(() => {
            state.motionHeadingFrame = null;
            activateMotionHeadings();
        });
    }

    function syncMotionToggleLabels() {
        const enabled = isMotionEnabled();
        queryAll("[data-motion-toggle]").forEach((button) => {
            const unavailable = reducedMotion;
            const label = unavailable
                ? "Animations are disabled by your system motion preference"
                : enabled
                    ? "Turn animations off"
                    : "Turn animations on";
            button.setAttribute("aria-label", label);
            button.setAttribute("title", label);
            button.setAttribute("aria-pressed", String(enabled));
            button.classList.toggle("is-motion-on", enabled);
            button.disabled = unavailable;

            const textLabel = button.querySelector("[data-motion-label]");
            const status = button.querySelector(".motion-toggle__status");
            if (textLabel) {
                textLabel.textContent = unavailable
                    ? "Animations: system preference"
                    : `Animations: ${enabled ? "on" : "off"}`;
            }
            if (status) status.textContent = enabled ? "On" : "Off";
        });
    }

    function discoverPhotoScenes() {
        const selectors = [
            ".home-hero__visual",
            ".page-hero__media",
            ".project-card__image",
            ".story-media__primary",
            ".story-media__secondary",
            ".split-feature__media",
            ".process-step__media",
            ".team-card",
            ".journal-card__image",
            ".video-shell",
            ".cta"
        ].join(", ");
        const excludedMedia = [
            ".brand img",
            ".client-strip img",
            ".testimonial-card__person img",
            "[class*='avatar'] img",
            "[class*='logo'] img",
            "img[src*='Logo']"
        ].join(", ");

        return queryAll(selectors).filter((scene) => {
            if (scene.matches(".page-hero__media, .cta")) return true;
            const media = scene.querySelector("img, video");
            return Boolean(media && !media.matches(excludedMedia) && !media.closest(".brand, .client-strip, .testimonial-card__person"));
        });
    }

    function photoSceneRole(scene) {
        if (scene.matches(".home-hero__visual, .page-hero__media")) return "hero";
        if (scene.matches(".project-card__image")) return "project";
        if (scene.matches(".story-media__primary, .story-media__secondary")) return "story";
        if (scene.matches(".split-feature__media")) return "feature";
        if (scene.matches(".process-step__media")) return "process";
        if (scene.matches(".team-card")) return "portrait";
        if (scene.matches(".journal-card__image")) return "journal";
        if (scene.matches(".video-shell")) return "video";
        if (scene.matches(".cta")) return "background";
        return "editorial";
    }

    function photoSceneDirection(scene, index, role) {
        if (scene.dataset.imageReveal === "right") return "right";
        if (scene.hasAttribute("data-image-reveal")) return "left";
        if (scene.matches(".story-media__secondary")) return "right";
        if (scene.closest(".split-feature--reverse")) return "right";
        if (role === "hero" || role === "video" || role === "background") return "scale";
        if (role === "portrait") return "up";
        return index % 2 === 0 ? "left" : "right";
    }

    function preparePhotoScene(scene, index) {
        if (scene.dataset.motionPhotoPrepared === "true") return;
        const role = photoSceneRole(scene);
        const direction = photoSceneDirection(scene, index, role);
        const media = scene.matches(".page-hero__media, .cta")
            ? scene
            : scene.querySelector("img, video");

        scene.classList.add(
            "motion-photo",
            `motion-photo--${role}`,
            `motion-photo--from-${direction}`,
            `motion-photo--${direction}`
        );
        scene.dataset.motionPhoto = direction;
        scene.dataset.motionPhotoRole = role;
        scene.dataset.motionPhotoPrepared = "true";
        scene.style.setProperty("--photo-index", String(index));
        scene.style.setProperty("--motion-photo-index", String(index));
        scene.style.setProperty("--photo-stagger", `${(index % 4) * 70}ms`);
        scene.style.setProperty("--photo-direction", direction === "left" ? "-1" : direction === "right" ? "1" : "0");

        if (media && media !== scene) {
            media.classList.add("motion-photo__media");
            if (media instanceof HTMLImageElement) {
                // Motion images are promoted early so the reveal never runs over
                // an empty lazy-load placeholder during a quick scroll.
                media.loading = "eager";
                media.decoding = "async";
                media.fetchPriority = role === "hero" ? "high" : "low";
            }
        }
        if (role === "project") scene.dataset.motionClip = "preserve";
        if (role === "video") scene.dataset.motionPlayback = "preserve";
    }

    function setPhotoSceneVisible(scene, settled = false) {
        if (
            !settled
            && (
                scene.classList.contains("is-motion-photo-entering")
                || scene.classList.contains("is-motion-photo-settled")
                || scene.dataset.motionPhotoState === "settled"
            )
        ) {
            return;
        }
        scene.classList.remove("is-motion-photo-prepared", "is-photo-loading");
        scene.classList.add("is-motion-photo-visible");
        scene.classList.toggle("is-motion-photo-settled", settled);
        scene.dataset.motionPhotoState = settled ? "settled" : "visible";

        const existingCompletion = state.photoCompletion.get(scene);
        if (existingCompletion) {
            window.clearTimeout(existingCompletion.timer);
            if (existingCompletion.listener) {
                scene.removeEventListener("animationend", existingCompletion.listener);
            }
            state.photoCompletion.delete(scene);
        }

        if (settled) {
            scene.classList.remove("is-motion-photo-entering");
            delete scene.dataset.motionPhotoEntering;
        } else if (scene.dataset.motionPhotoEntering !== "true") {
            scene.dataset.motionPhotoEntering = "true";
            scene.classList.add("is-motion-photo-entering");
            let settleTimer = null;
            const settle = () => {
                window.clearTimeout(settleTimer);
                scene.classList.remove("is-motion-photo-entering");
                scene.classList.add("is-motion-photo-settled");
                scene.dataset.motionPhotoState = "settled";
                scene.dataset.motionSeen = "true";
                delete scene.dataset.motionPhotoEntering;
                state.photoCompletion.delete(scene);
            };
            const stagger = Number.parseInt(scene.style.getPropertyValue("--photo-stagger") || "0", 10);
            settleTimer = window.setTimeout(settle, stagger + 1750);
            state.photoCompletion.set(scene, {
                listener: null,
                timer: settleTimer
            });
        }
    }

    function revealPhotoSceneWhenReady(scene) {
        if (
            !scene?.classList
            || scene.classList.contains("is-motion-photo-visible")
            || scene.classList.contains("is-motion-photo-settled")
            || scene.dataset.motionPhotoWaiting === "true"
        ) {
            return;
        }

        const media = scene.matches(".page-hero__media, .cta")
            ? null
            : scene.querySelector(".motion-photo__media, img, video");
        const mediaReady = !media
            || (media instanceof HTMLImageElement && media.complete && media.naturalWidth > 0)
            || (media instanceof HTMLVideoElement && media.readyState >= 2);

        if (mediaReady) {
            setPhotoSceneVisible(scene, false);
            return;
        }

        scene.dataset.motionPhotoWaiting = "true";
        scene.classList.add("is-photo-loading");
        let timeout = null;
        let resolved = false;
        const finish = () => {
            if (resolved) return;
            resolved = true;
            window.clearTimeout(timeout);
            media?.removeEventListener("load", finish);
            media?.removeEventListener("error", finish);
            media?.removeEventListener("loadeddata", finish);
            delete scene.dataset.motionPhotoWaiting;
            scene.classList.remove("is-photo-loading");
            if (isMotionEnabled() && root.classList.contains("photo-motion-armed")) {
                setPhotoSceneVisible(scene, false);
            } else {
                setPhotoSceneVisible(scene, true);
            }
        };

        media?.addEventListener("load", finish, { once: true });
        media?.addEventListener("error", finish, { once: true });
        media?.addEventListener("loadeddata", finish, { once: true });
        if (media instanceof HTMLImageElement && typeof media.decode === "function") {
            media.decode().then(finish).catch(() => undefined);
        }
        timeout = window.setTimeout(finish, 1400);
    }

    function ensurePhotoObserver() {
        if (state.photoObserver || typeof window.IntersectionObserver !== "function") return;
        state.photoObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const scene = entry.target;
                    scene.style.setProperty("--photo-visibility", entry.intersectionRatio.toFixed(3));
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.01 && isMotionEnabled()) {
                        state.activePhotoScenes.add(scene);
                        scene.classList.add("is-motion-photo-active");
                        if (!scene.classList.contains("is-motion-photo-visible")) {
                            revealPhotoSceneWhenReady(scene);
                        }
                    } else {
                        state.activePhotoScenes.delete(scene);
                        scene.classList.remove("is-motion-photo-active");
                    }
                });
                scheduleMotionScene();
            },
            photoRevealObserverOptions
        );
    }

    function settlePhotoMotion() {
        root.classList.remove("photo-motion-armed");
        state.photoObserver?.disconnect();
        state.activePhotoScenes.clear();
        state.photoScenes.forEach((scene) => {
            scene.classList.remove("is-motion-photo-prepared", "is-motion-photo-active", "is-photo-loading");
            setPhotoSceneVisible(scene, true);
            scene.style.removeProperty("--photo-progress");
            scene.style.removeProperty("--photo-visibility");
        });
    }

    function resumePhotoMotion() {
        if (!isMotionEnabled() || typeof window.IntersectionObserver !== "function") {
            settlePhotoMotion();
            return;
        }

        ensurePhotoObserver();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        state.photoScenes.forEach((scene) => {
            const bounds = scene.getBoundingClientRect();
            if (scene.dataset.motionSeen === "true") {
                scene.classList.remove("is-motion-photo-prepared", "is-motion-photo-entering");
                scene.classList.add("is-motion-photo-visible", "is-motion-photo-settled");
                scene.dataset.motionPhotoState = "settled";
            } else if (bounds.top > viewportHeight * 1.02) {
                scene.classList.remove(
                    "is-motion-photo-visible",
                    "is-motion-photo-settled",
                    "is-motion-photo-entering"
                );
                scene.classList.add("is-motion-photo-prepared");
                scene.dataset.motionPhotoState = "prepared";
            } else if (
                scene.classList.contains("is-motion-photo-settled")
                || scene.dataset.motionPhotoState === "settled"
            ) {
                scene.classList.remove("is-motion-photo-prepared", "is-motion-photo-entering");
                scene.classList.add("is-motion-photo-visible", "is-motion-photo-settled");
                scene.dataset.motionPhotoState = "settled";
                scene.dataset.motionSeen = "true";
            } else {
                revealPhotoSceneWhenReady(scene);
            }
            state.photoObserver?.observe(scene);
        });
        if (state.photoObserver) root.classList.add("photo-motion-armed");
    }

    function initializePhotoMotion() {
        state.photoScenes = discoverPhotoScenes();
        state.photoScenes.forEach(preparePhotoScene);
        if (!state.photoScenes.length) return;

        if (!isMotionEnabled() || typeof window.IntersectionObserver !== "function") {
            settlePhotoMotion();
            return;
        }

        ensurePhotoObserver();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        state.photoScenes.forEach((scene) => {
            const bounds = scene.getBoundingClientRect();
            if (bounds.bottom < 0) {
                setPhotoSceneVisible(scene, true);
                scene.dataset.motionSeen = "true";
            } else if (
                scene.matches(".page-hero__media")
                && bounds.top < viewportHeight
                && bounds.bottom > 0
            ) {
                // The hero media is itself clip-masked while prepared. Revealing
                // it directly avoids a clip-path / IntersectionObserver deadlock.
                revealPhotoSceneWhenReady(scene);
            } else {
                scene.classList.add("is-motion-photo-prepared");
                scene.classList.remove("is-motion-photo-visible", "is-motion-photo-settled");
                scene.dataset.motionPhotoState = "prepared";
            }
            state.photoObserver?.observe(scene);
        });
        if (state.photoObserver) root.classList.add("photo-motion-armed");
    }

    function clearMotionProperties() {
        window.cancelAnimationFrame(state.motionFrame);
        state.motionFrame = null;
        window.cancelAnimationFrame(state.motionHeadingFrame);
        state.motionHeadingFrame = null;
        window.cancelAnimationFrame(state.cursorFrame);
        state.cursorFrame = null;
        window.cancelAnimationFrame(state.pointerFrame);
        state.pointerFrame = null;
        state.pendingPointer = null;
        window.clearTimeout(state.velocityTimer);
        state.velocityTimer = null;

        ["--scroll-velocity", "--scroll-direction"].forEach((property) => {
            root.style.removeProperty(property);
        });
        state.motionSections.forEach((section) => {
            section.style.removeProperty("--section-progress");
            section.classList.remove("is-motion-active");
        });
        state.motionMedia.forEach((media) => {
            media.style.removeProperty("--motion-y");
        });
        state.photoScenes.forEach((scene) => {
            scene.style.removeProperty("--photo-progress");
            scene.style.removeProperty("--photo-visibility");
            scene.classList.remove("is-motion-photo-active");
        });
        queryAll(".home-hero__visual").forEach((visual) => {
            visual.style.removeProperty("--parallax-y");
        });
        queryAll(".tilt-card").forEach((card) => {
            card.style.removeProperty("--tilt-x");
            card.style.removeProperty("--tilt-y");
        });
        queryAll(".button, .icon-button, .text-link").forEach((element) => {
            element.style.removeProperty("--mag-x");
            element.style.removeProperty("--mag-y");
        });
        queryAll(
            ".project-card, .service-card, .team-card, .journal-card, .testimonial-card, " +
            ".value-card, .catalog-card, .scope-card, .package-card, .faq-item, .process-step, " +
            ".home-hero, .home-hero__visual, .page-hero__media, .story-media, .split-feature__media, " +
            ".video-shell, .cta"
        ).forEach((element) => {
            element.style.removeProperty("--pointer-x");
            element.style.removeProperty("--pointer-y");
        });

        state.lastMagnetic = null;
        state.lastSpotlight = null;
        state.cursorInitialized = false;
        state.cursor?.style.removeProperty("--cursor-x");
        state.cursor?.style.removeProperty("--cursor-y");
        state.cursor?.style.removeProperty("transform");
        state.cursor?.classList.remove(
            "is-visible",
            "is-active",
            "is-hovering",
            "is-interactive",
            "is-pressed",
            "is-down"
        );
        root.classList.remove("has-motion-cursor");
    }

    function releaseMotion() {
        showRevealContent(document, true);
        state.revealObserver?.disconnect();
        state.futureRevealObserver?.disconnect();
        state.motionHeadingObserver?.disconnect();
        settlePhotoMotion();
        queryAll(".motion-heading").forEach((heading) => {
            heading.classList.remove("is-motion-heading-prepared");
            heading.classList.add("is-motion-visible", "is-motion-settled");
            heading.dataset.motionHeadingState = "settled";
        });
        clearMotionProperties();
    }

    function applyMotionPreference(enabled, { persist = true, announce = true } = {}) {
        const wasEnabled = isMotionEnabled();
        motionPreference = enabled ? "on" : "off";
        if (persist) {
            try {
                window.localStorage.setItem(motionStorageKey, motionPreference);
            } catch {}
        }

        root.dataset.motion = reducedMotion ? "off" : motionPreference;
        syncMotionToggleLabels();

        if (isMotionEnabled()) {
            if (finePointer) root.classList.add("has-motion-cursor");
            if (!wasEnabled) {
                prepareFutureReveals();
                activateMotionHeadings();
                resumePhotoMotion();
            }
            scheduleMotionHeadings();
            scheduleMotionScene();
        } else {
            releaseMotion();
        }

        if (announce) {
            showToast(
                reducedMotion
                    ? "Animations stay off to respect your system motion preference."
                    : `Animations ${isMotionEnabled() ? "enabled" : "disabled"}.`
            );
        }
    }

    function updateMotionScene(now = performance.now()) {
        state.motionFrame = null;
        if (!isMotionEnabled() || document.visibilityState === "hidden") return;

        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const elapsed = Math.max(now - state.previousScrollTime, 16);
        const delta = scrollY - state.previousScrollY;
        const velocity = clamp((Math.abs(delta) / Math.max(elapsed, 1)) * 1000, 0, 600);

        root.style.setProperty("--scroll-velocity", velocity.toFixed(2));
        if (Math.abs(delta) > 0.25) {
            root.style.setProperty("--scroll-direction", delta > 0 ? "1" : "-1");
        }
        state.previousScrollY = scrollY;
        state.previousScrollTime = now;

        const sections = state.activeSections.size
            ? Array.from(state.activeSections)
            : state.motionSections;
        sections.forEach((section) => {
            const bounds = section.getBoundingClientRect();
            if (bounds.bottom < -viewportHeight * 0.2 || bounds.top > viewportHeight * 1.2) return;
            section.classList.add("is-motion-active");
            const progress = clamp(
                (viewportHeight - bounds.top) / (viewportHeight + Math.max(bounds.height, 1)),
                0,
                1
            );
            section.style.setProperty("--section-progress", progress.toFixed(4));
        });

        state.motionMedia.forEach((media) => {
            const bounds = media.getBoundingClientRect();
            if (bounds.bottom < -160 || bounds.top > viewportHeight + 160) return;
            const center = bounds.top + bounds.height / 2;
            const travel = Math.max((viewportHeight + bounds.height) / 2, 1);
            const normalized = clamp((center - viewportHeight / 2) / travel, -1, 1);
            media.style.setProperty("--motion-y", `${(-normalized * 22).toFixed(2)}px`);
        });

        state.activePhotoScenes.forEach((scene) => {
            const bounds = scene.getBoundingClientRect();
            const progress = clamp(
                (viewportHeight - bounds.top) / (viewportHeight + Math.max(bounds.height, 1)),
                0,
                1
            );
            scene.style.setProperty("--photo-progress", progress.toFixed(4));
        });

        window.clearTimeout(state.velocityTimer);
        state.velocityTimer = window.setTimeout(() => {
            if (isMotionEnabled()) root.style.setProperty("--scroll-velocity", "0");
        }, 120);
    }

    function scheduleMotionScene() {
        if (!isMotionEnabled() || state.motionFrame !== null) return;
        state.motionFrame = nextFrame(updateMotionScene);
    }

    function initializeMotionScene() {
        state.motionSections = queryAll("main section");
        state.motionMedia = queryAll(
            ".home-hero__visual img, .page-hero__media, .story-media img, " +
            ".split-feature__media img, .process-step__media img, .team-card img, " +
            ".journal-card__image img"
        );

        if (typeof window.IntersectionObserver === "function") {
            state.sceneObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            state.activeSections.add(entry.target);
                            entry.target.classList.toggle("is-motion-active", isMotionEnabled());
                        } else {
                            state.activeSections.delete(entry.target);
                            entry.target.classList.remove("is-motion-active");
                        }
                    });
                    scheduleMotionScene();
                },
                { rootMargin: "18% 0px 18% 0px", threshold: 0 }
            );
            state.motionSections.forEach((section) => state.sceneObserver.observe(section));
        } else {
            state.motionSections.forEach((section) => state.activeSections.add(section));
        }

        window.addEventListener("scroll", scheduleMotionScene, { passive: true });
        window.addEventListener("resize", scheduleMotionScene, { passive: true });
        window.addEventListener("orientationchange", scheduleMotionScene, { passive: true });
    }

    function startCursorFrame() {
        if (!finePointer || !isMotionEnabled() || state.cursorFrame !== null) return;
        state.cursorFrame = nextFrame(updateMotionCursor);
    }

    function updateMotionCursor() {
        state.cursorFrame = null;
        if (!finePointer || !isMotionEnabled() || document.visibilityState === "hidden" || !state.cursor) return;

        state.cursorX += (state.cursorTargetX - state.cursorX) * 0.2;
        state.cursorY += (state.cursorTargetY - state.cursorY) * 0.2;
        state.cursor.style.setProperty("--cursor-x", `${state.cursorX.toFixed(2)}px`);
        state.cursor.style.setProperty("--cursor-y", `${state.cursorY.toFixed(2)}px`);
        state.cursor.style.transform = `translate3d(${state.cursorX.toFixed(2)}px, ${state.cursorY.toFixed(2)}px, 0)`;

        if (
            Math.abs(state.cursorTargetX - state.cursorX) > 0.08 ||
            Math.abs(state.cursorTargetY - state.cursorY) > 0.08
        ) {
            state.cursorFrame = nextFrame(updateMotionCursor);
        }
    }

    function resetMagnetic(element) {
        element?.style.removeProperty("--mag-x");
        element?.style.removeProperty("--mag-y");
    }

    function hideMotionCursor() {
        resetMagnetic(state.lastMagnetic);
        state.lastMagnetic = null;
        state.cursorInitialized = false;
        state.pendingPointer = null;
        window.cancelAnimationFrame(state.pointerFrame);
        state.pointerFrame = null;
        window.cancelAnimationFrame(state.cursorFrame);
        state.cursorFrame = null;
        state.cursor?.classList.remove(
            "is-visible",
            "is-active",
            "is-hovering",
            "is-interactive",
            "is-pressed",
            "is-down"
        );
    }

    function updatePointerMotion(event) {
        if (!finePointer || !isMotionEnabled()) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.isConnected) return;

        state.cursorTargetX = event.clientX;
        state.cursorTargetY = event.clientY;
        if (!state.cursorInitialized) {
            state.cursorInitialized = true;
            state.cursorX = event.clientX;
            state.cursorY = event.clientY;
        }

        const interactive = target.closest(
            "a, button, input, textarea, select, [role='button'], [data-project], .tilt-card"
        );
        state.cursor?.classList.add("is-visible", "is-active");
        state.cursor?.classList.toggle("is-hovering", Boolean(interactive));
        state.cursor?.classList.toggle("is-interactive", Boolean(interactive));
        startCursorFrame();

        const magnetic = target.closest(".button, .icon-button:not(.menu-toggle), .text-link");
        if (state.lastMagnetic && state.lastMagnetic !== magnetic) {
            resetMagnetic(state.lastMagnetic);
        }
        if (magnetic && !magnetic.matches(":disabled")) {
            magnetic.classList.add("motion-magnetic");
            const bounds = magnetic.getBoundingClientRect();
            const x = clamp((event.clientX - (bounds.left + bounds.width / 2)) / Math.max(bounds.width / 2, 1), -1, 1);
            const y = clamp((event.clientY - (bounds.top + bounds.height / 2)) / Math.max(bounds.height / 2, 1), -1, 1);
            magnetic.style.setProperty("--mag-x", `${(x * 5).toFixed(2)}px`);
            magnetic.style.setProperty("--mag-y", `${(y * 5).toFixed(2)}px`);
        }
        state.lastMagnetic = magnetic;

        const spotlight = target.closest(
            ".project-card, .service-card, .team-card, .journal-card, .testimonial-card, " +
            ".value-card, .catalog-card, .scope-card, .package-card, .faq-item, .process-step, " +
            ".home-hero__visual, .page-hero__media, .story-media, .split-feature__media, " +
            ".video-shell, .cta"
        );
        if (spotlight) {
            const bounds = spotlight.getBoundingClientRect();
            const x = clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1);
            const y = clamp((event.clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1);
            spotlight.style.setProperty("--pointer-x", `${(x * 100).toFixed(2)}%`);
            spotlight.style.setProperty("--pointer-y", `${(y * 100).toFixed(2)}%`);

            const homeHero = spotlight.closest(".home-hero");
            if (homeHero) {
                const heroBounds = homeHero.getBoundingClientRect();
                const heroX = clamp((event.clientX - heroBounds.left) / Math.max(heroBounds.width, 1), 0, 1);
                const heroY = clamp((event.clientY - heroBounds.top) / Math.max(heroBounds.height, 1), 0, 1);
                homeHero.style.setProperty("--pointer-x", `${(heroX * 100).toFixed(2)}%`);
                homeHero.style.setProperty("--pointer-y", `${(heroY * 100).toFixed(2)}%`);
            }
        }
        state.lastSpotlight = spotlight;
    }

    function queuePointerMotion(event) {
        if (!finePointer || !isMotionEnabled()) return;
        state.pendingPointer = {
            target: event.target,
            clientX: event.clientX,
            clientY: event.clientY
        };
        if (state.pointerFrame !== null) return;
        state.pointerFrame = nextFrame(() => {
            state.pointerFrame = null;
            const pointer = state.pendingPointer;
            state.pendingPointer = null;
            if (pointer) updatePointerMotion(pointer);
        });
    }

    function initializePointerMotion() {
        if (!finePointer) return;
        queryAll(".button, .icon-button:not(.menu-toggle), .text-link").forEach((element) => {
            element.classList.add("motion-magnetic");
        });
        queryAll(
            ".project-card, .service-card, .team-card, .journal-card, .testimonial-card, " +
            ".value-card, .catalog-card, .scope-card, .package-card, .faq-item, .process-step, " +
            ".home-hero__visual, .page-hero__media, .story-media, .split-feature__media, " +
            ".video-shell, .cta"
        ).forEach((element) => {
            element.classList.add("motion-spotlight");
        });
        root.classList.toggle("has-motion-cursor", isMotionEnabled());
        document.addEventListener("pointermove", queuePointerMotion, { passive: true });
        document.addEventListener(
            "pointerdown",
            () => {
                if (isMotionEnabled()) state.cursor?.classList.add("is-pressed", "is-down");
            },
            { passive: true }
        );
        document.addEventListener(
            "pointerup",
            () => state.cursor?.classList.remove("is-pressed", "is-down"),
            { passive: true }
        );
        window.addEventListener(
            "pointerout",
            (event) => {
                if (event.relatedTarget) return;
                hideMotionCursor();
            },
            { passive: true }
        );
        window.addEventListener("blur", hideMotionCursor, { passive: true });
    }

    function initializeMotionRuntime() {
        prepareMotionHeadings();
        initializeMotionScene();
        initializePointerMotion();
        root.classList.add("motion-ready");

        queryAll("[data-motion-toggle]").forEach((button) => {
            button.addEventListener("click", () => {
                if (reducedMotion) {
                    showToast("Animations stay off to respect your system motion preference.");
                    return;
                }
                applyMotionPreference(!isMotionEnabled());
            });
        });

        const handleReducedMotionChange = (event) => {
            reducedMotion = Boolean(event.matches);
            applyMotionPreference(motionPreference === "on", {
                persist: false,
                announce: false
            });
        };
        if (typeof reducedMotionQuery?.addEventListener === "function") {
            reducedMotionQuery.addEventListener("change", handleReducedMotionChange);
        } else if (typeof reducedMotionQuery?.addListener === "function") {
            reducedMotionQuery.addListener(handleReducedMotionChange);
        }

        window.addEventListener(
            "pageshow",
            () => {
                document.body.classList.remove("is-leaving");
                state.previousScrollY = window.scrollY || 0;
                state.previousScrollTime = performance.now();
                if (isMotionEnabled()) {
                    scheduleMotionHeadings();
                    scheduleMotionScene();
                } else {
                    releaseMotion();
                }
            },
            { passive: true }
        );
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                hideMotionCursor();
                return;
            }
            state.previousScrollY = window.scrollY || 0;
            state.previousScrollTime = performance.now();
            scheduleMotionHeadings();
            scheduleMotionScene();
        });
        window.addEventListener(
            "resize",
            () => {
                state.previousScrollY = window.scrollY || 0;
                state.previousScrollTime = performance.now();
                scheduleMotionHeadings();
            },
            { passive: true }
        );

        syncMotionToggleLabels();
        if (isMotionEnabled()) {
            scheduleMotionHeadings();
            scheduleMotionScene();
        } else {
            releaseMotion();
        }
    }

    function createSearchDialog() {
        const dialog = document.createElement("dialog");
        dialog.className = "search-dialog";
        dialog.id = "search-dialog";
        dialog.setAttribute("aria-labelledby", "search-dialog-title");
        dialog.innerHTML = `
            <div class="dialog-shell">
                <button class="icon-button dialog-close" type="button" data-dialog-close aria-label="Close search">×</button>
                <p class="eyebrow">Site search</p>
                <h2 class="dialog-title" id="search-dialog-title">Find your way around Interno.</h2>
                <p class="dialog-copy">Search pages, services and project information. Press Esc to close.</p>
                <div class="search-box">
                    <label class="micro-copy" for="site-search-input">What are you looking for?</label>
                    <input class="search-input" id="site-search-input" type="search" autocomplete="off" placeholder="Try “pricing” or “projects”…">
                    <div class="search-results" id="search-results" aria-live="polite"></div>
                </div>
            </div>
        `;
        document.body.append(dialog);

        const input = dialog.querySelector("#site-search-input");
        const results = dialog.querySelector("#search-results");
        const render = (query = "") => {
            const normalized = query.trim().toLowerCase();
            const matches = searchEntries.filter((entry) => {
                const haystack = `${entry.title} ${entry.description} ${entry.keywords}`.toLowerCase();
                return !normalized || haystack.includes(normalized);
            });

            if (!matches.length) {
                results.innerHTML = '<p class="search-empty">No matches yet. Try “services”, “team” or “pricing”.</p>';
                return;
            }

            results.innerHTML = matches
                .map(
                    (entry) => `
                        <a class="search-result" href="${entry.url}">
                            <span>
                                <strong>${entry.title}</strong>
                                <span>${entry.description}</span>
                            </span>
                            <span class="search-result__arrow" aria-hidden="true">↗</span>
                        </a>
                    `
                )
                .join("");
        };

        input.addEventListener("input", () => render(input.value));
        dialog.addEventListener("close", () => {
            const openedDialog = document.querySelector("dialog[open]");

            if (state.cursor) {
                if (openedDialog) {
                    openedDialog.appendChild(state.cursor);
                } else {
                    document.body.appendChild(state.cursor);
                }
            }

            if (!openedDialog) {
                document.body.classList.remove("modal-open");
            }
        });
        render();
    }

    function createContactDialog() {
        const dialog = document.createElement("dialog");
        dialog.className = "contact-dialog";
        dialog.id = "contact-dialog";
        dialog.setAttribute("aria-labelledby", "contact-dialog-title");
        dialog.innerHTML = `
            <div class="dialog-shell">
                <button class="icon-button dialog-close" type="button" data-dialog-close aria-label="Close enquiry form">×</button>
                <p class="eyebrow">Start a conversation</p>
                <h2 class="dialog-title" id="contact-dialog-title">Tell us about the space you want to transform.</h2>
                <p class="dialog-copy">Share the essentials and we will prepare an email in your preferred mail app.</p>
                <form class="contact-dialog__form js-contact-form">
                    <div class="field">
                        <label for="dialog-name">Name</label>
                        <input id="dialog-name" name="name" type="text" autocomplete="name" placeholder="Your name" required>
                    </div>
                    <div class="field">
                        <label for="dialog-email">Email</label>
                        <input id="dialog-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
                    </div>
                    <div class="field">
                        <label for="dialog-project">Project type</label>
                        <select id="dialog-project" name="project" required>
                            <option value="">Choose a service</option>
                            <option>Concept & direction</option>
                            <option>Signature interior</option>
                            <option>Full-service residence</option>
                            <option>Styling & decoration</option>
                            <option>Custom enquiry</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="dialog-budget">Estimated budget</label>
                        <select id="dialog-budget" name="budget" required>
                            <option value="">Choose a range</option>
                            <option>$2,500–$7,500</option>
                            <option>$7,500–$20,000</option>
                            <option>$20,000–$50,000</option>
                            <option>$50,000+</option>
                            <option>Not decided yet</option>
                        </select>
                    </div>
                    <div class="field field--full">
                        <label for="dialog-message">A little about your project</label>
                        <textarea id="dialog-message" name="message" placeholder="Location, rooms, goals and ideal timing…" required></textarea>
                    </div>
                    <div class="contact-dialog__actions">
                        <p class="micro-copy">Submitting opens your mail app with this enquiry pre-filled.</p>
                        <button class="button button--accent" type="submit">
                            <span>Prepare enquiry</span><span class="arrow" aria-hidden="true">↗</span>
                        </button>
                    </div>
                </form>
            </div>
        `;
        document.body.append(dialog);
    }

    function createProjectDialog() {
        const dialog = document.createElement("dialog");
        dialog.className = "project-dialog";
        dialog.id = "project-dialog";
        dialog.setAttribute("aria-labelledby", "project-dialog-title");
        dialog.innerHTML = `
            <div class="dialog-shell">
                <div class="project-dialog__image">
                    <img src="img/project-1.webp" alt="Interno project preview">
                </div>
                <div class="project-dialog__content">
                    <button class="icon-button dialog-close" type="button" data-dialog-close aria-label="Close project">×</button>
                    <p class="eyebrow">Selected project</p>
                    <h2 class="dialog-title" id="project-dialog-title"></h2>
                    <p class="dialog-copy" data-project-description></p>
                    <div class="project-dialog__meta">
                        <div><span>Type</span><strong data-project-type></strong></div>
                        <div><span>Location</span><strong data-project-location></strong></div>
                        <div><span>Completed</span><strong data-project-year></strong></div>
                    </div>
                    <button class="button button--accent" type="button" data-open-contact style="margin-top: 30px;">
                        <span>Start a similar project</span><span class="arrow" aria-hidden="true">↗</span>
                    </button>
                </div>
            </div>
        `;
        document.body.append(dialog);
    }

    function openDialog(dialog, focusSelector) {
        if (!dialog || dialog.open) return;

        document.body.classList.remove("nav-open");

        dialog.showModal();
        document.body.classList.add("modal-open");

        // Переносим кастомный курсор в верхний слой dialog
        if (state.cursor) {
            dialog.appendChild(state.cursor);
        }

        window.setTimeout(() => {
            dialog.querySelector(
                focusSelector || "button, input, select, textarea"
            )?.focus();
        }, 60);
    }

    function closeDialog(dialog) {
        if (dialog?.open) dialog.close();
    }

    function initializeDialogs() {
        document.addEventListener("click", (event) => {
            const searchTrigger = event.target.closest("[data-open-search]");
            const contactTrigger = event.target.closest("[data-open-contact]");
            const closeTrigger = event.target.closest("[data-dialog-close]");
            const projectTrigger = event.target.closest("[data-project]");

            if (searchTrigger) {
                event.preventDefault();
                openDialog(document.querySelector("#search-dialog"), "#site-search-input");
            }

            if (contactTrigger) {
                event.preventDefault();
                const selectedPackage = contactTrigger.dataset.package;
                const dialog = document.querySelector("#contact-dialog");
                if (selectedPackage) {
                    const select = dialog.querySelector('select[name="project"]');
                    const matchingOption = Array.from(select.options).find(
                        (option) => option.textContent.trim() === selectedPackage
                    );
                    if (matchingOption) select.value = matchingOption.value;
                }
                closeDialog(document.querySelector("#project-dialog"));
                window.setTimeout(() => openDialog(dialog, 'input[name="name"]'), 80);
            }

            if (closeTrigger) {
                closeDialog(closeTrigger.closest("dialog"));
            }

            if (projectTrigger) {
                event.preventDefault();
                populateProjectDialog(projectTrigger);
            }
        });

        queryAll("dialog").forEach((dialog) => {
            dialog.addEventListener("click", (event) => {
                if (event.target === dialog) closeDialog(dialog);
            });
            dialog.addEventListener("close", () => {
                const openedDialog = document.querySelector("dialog[open]");

                if (state.cursor) {
                    if (openedDialog) {
                        openedDialog.appendChild(state.cursor);
                    } else {
                        document.body.appendChild(state.cursor);
                    }
                }

                if (!openedDialog) {
                    document.body.classList.remove("modal-open");
                }
            });
        });

        document.addEventListener("keydown", (event) => {
            const target = event.target;
            const isTyping =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                target?.isContentEditable;

            if (event.key === "/" && !isTyping && !document.querySelector("dialog[open]")) {
                event.preventDefault();
                openDialog(document.querySelector("#search-dialog"), "#site-search-input");
            }
        });
    }

    function populateProjectDialog(trigger) {
        const dialog = document.querySelector("#project-dialog");
        const image = dialog.querySelector("img");
        image.src = trigger.dataset.image || trigger.querySelector("img")?.src || "";
        image.alt = `${trigger.dataset.title || "Interno project"} interior`;
        dialog.querySelector("#project-dialog-title").textContent = trigger.dataset.title || "Interno project";
        dialog.querySelector("[data-project-description]").textContent =
            trigger.dataset.description || "A calm, functional interior shaped around the people who live there.";
        dialog.querySelector("[data-project-type]").textContent = trigger.dataset.type || "Residential";
        dialog.querySelector("[data-project-location]").textContent = trigger.dataset.location || "New York";
        dialog.querySelector("[data-project-year]").textContent = trigger.dataset.year || "2026";
        openDialog(dialog, "[data-dialog-close]");
    }

    function initializeTheme() {
        const updateLabels = () => {
            const dark = root.dataset.theme === "dark";
            queryAll("[data-theme-toggle]").forEach((button) => {
                button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
                button.setAttribute("title", dark ? "Light theme" : "Dark theme");
                button.setAttribute("aria-pressed", String(dark));
            });
        };

        queryAll("[data-theme-toggle]").forEach((button) => {
            button.addEventListener("click", (event) => {
                const next = root.dataset.theme === "dark" ? "light" : "dark";
                root.style.setProperty("--theme-x", `${event.clientX || window.innerWidth / 2}px`);
                root.style.setProperty("--theme-y", `${event.clientY || 0}px`);

                const applyTheme = () => {
                    if (next === "dark") {
                        root.dataset.theme = "dark";
                    } else {
                        delete root.dataset.theme;
                    }
                    try {
                        window.localStorage.setItem("interno-theme", next);
                    } catch {}
                    updateLabels();
                };

                if (isMotionEnabled() && typeof document.startViewTransition === "function") {
                    try {
                        document.startViewTransition(applyTheme);
                    } catch {
                        applyTheme();
                    }
                } else {
                    applyTheme();
                }
            });
        });

        updateLabels();
    }

    function initializeNavigation() {
        const menuButtons = queryAll("[data-menu-toggle]");
        const setMenu = (open) => {
            if (open) hideMotionCursor();
            document.body.classList.toggle("nav-open", open);
            menuButtons.forEach((button) => {
                button.setAttribute("aria-expanded", String(open));
                button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
            });
        };

        menuButtons.forEach((button) => {
            button.addEventListener("click", () => setMenu(!document.body.classList.contains("nav-open")));
        });

        queryAll(".mobile-menu a").forEach((link) => {
            link.addEventListener("click", () => setMenu(false));
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
                setMenu(false);
            }
        });
    }

    function initializeScrollEffects() {
        const progress = document.querySelector(".scroll-progress");
        const header = document.querySelector(".site-header");
        const heroVisual = document.querySelector(".home-hero__visual");

        const update = () => {
            const top = window.scrollY;
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            const ratio = scrollable > 0 ? Math.min(top / scrollable, 1) : 0;
            progress.style.transform = `scaleX(${ratio})`;
            header?.classList.toggle("is-scrolled", top > 30);

            if (heroVisual && isMotionEnabled()) {
                const amount = Math.min(top * 0.055, 42);
                heroVisual.style.setProperty("--parallax-y", `${amount}px`);
            } else {
                heroVisual?.style.removeProperty("--parallax-y");
            }

            state.scrollFrame = null;
        };

        window.addEventListener(
            "scroll",
            () => {
                if (!state.scrollFrame) state.scrollFrame = requestAnimationFrame(update);
            },
            { passive: true }
        );
        update();
    }

    function initializeReveal() {
        const selector = genericRevealSelector;
        const elements = queryAll(selector);
        if (!elements.length) {
            state.revealReady = true;
            return;
        }

        elements.forEach((element) => {
            const delay = Number.parseInt(element.dataset.delay || "0", 10);
            if (delay) element.style.setProperty("--reveal-delay", `${delay}ms`);
        });

        const observerSupported = typeof window.IntersectionObserver === "function";
        if (!isMotionEnabled() || !observerSupported) {
            showRevealContent(document, true);
            state.revealReady = true;
            return;
        }

        let observer;
        let scanFrame = null;
        const pendingElements = new Set(elements.filter((element) => !element.classList.contains("is-visible")));

        const reveal = (element) => {
            if (!element?.classList) return;
            pendingElements.delete(element);
            observer?.unobserve(element);
            revealElementWhenReady(element, beginRevealElement);
        };

        const isRendered = (element) => {
            if (!element.isConnected) return false;
            if (element.getClientRects().length === 0) return false;
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden";
        };

        const observeElement = (element) => {
            if (element.classList.contains("is-visible")) {
                pendingElements.delete(element);
                return;
            }
            if (!isRendered(element)) return;
            pendingElements.add(element);
            prepareRevealElement(element);
            observer.observe(element);
        };

        const scan = () => {
            scanFrame = null;
            queryAll(selector).forEach((element) => {
                if (!element.classList.contains("is-visible")) pendingElements.add(element);
            });
            Array.from(pendingElements).forEach(observeElement);
        };

        const scheduleScan = () => {
            if (scanFrame !== null) return;
            scanFrame = nextFrame(scan);
        };

        try {
            observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            reveal(entry.target);
                        }
                    });
                },
                scrollRevealObserverOptions
            );
            state.revealObserver = observer;
        } catch {
            showRevealContent(document, true);
            state.revealReady = true;
            return;
        }

        elements.forEach(observeElement);
        root.classList.add("reveal-armed");

        window.addEventListener("scroll", scheduleScan, { passive: true });
        window.addEventListener("resize", scheduleScan, { passive: true });
        window.addEventListener("orientationchange", scheduleScan, { passive: true });
        window.addEventListener("load", scheduleScan, { once: true });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") scheduleScan();
        });

        window.addEventListener("pageshow", (event) => {
            if (event.persisted) {
                showRevealContent(document, true);
                observer.disconnect();
            } else {
                scheduleScan();
            }
        });

        if (typeof window.MutationObserver === "function" && document.body) {
            const mutationObserver = new MutationObserver(scheduleScan);
            mutationObserver.observe(document.body, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ["open", "hidden"]
            });
        }

        state.revealReady = true;
    }

    function initializeCounters() {
        const counters = queryAll("[data-counter]");
        if (!counters.length) return;

        const animate = (element) => {
            const target = Number.parseInt(element.dataset.counter || element.textContent, 10);
            if (!Number.isFinite(target)) return;
            if (!isMotionEnabled()) {
                element.textContent = String(target);
                return;
            }

            const start = performance.now();
            const duration = 1500;
            const tick = (now) => {
                if (!isMotionEnabled()) {
                    element.textContent = String(target);
                    return;
                }
                const progress = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                element.textContent = String(Math.round(target * eased));
                if (progress < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };

        if (!("IntersectionObserver" in window)) {
            counters.forEach(animate);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    animate(entry.target);
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.6 }
        );
        counters.forEach((counter) => observer.observe(counter));
    }

    function initializeTilt() {
        if (!finePointer) return;
        queryAll(".tilt-card").forEach((card) => {
            card.addEventListener("pointermove", (event) => {
                if (!isMotionEnabled()) return;
                const bounds = card.getBoundingClientRect();
                const x = (event.clientX - bounds.left) / bounds.width - 0.5;
                const y = (event.clientY - bounds.top) / bounds.height - 0.5;
                card.style.setProperty("--tilt-x", `${y * -5}deg`);
                card.style.setProperty("--tilt-y", `${x * 5}deg`);
            });
            card.addEventListener("pointerleave", () => {
                card.style.setProperty("--tilt-x", "0deg");
                card.style.setProperty("--tilt-y", "0deg");
            });
        });
    }

    function initializeVideo() {
        const video = document.querySelector("#project-video");
        const shell = video?.closest(".video-shell");
        const overlay = shell?.querySelector(".video-shell__overlay");
        if (!video || !shell || !overlay) return;

        const sync = () => shell.classList.toggle("is-playing", !video.paused && !video.ended);
        overlay.addEventListener("click", async () => {
            try {
                await video.play();
                video.controls = true;
                sync();
            } catch {
                showToast("Your browser blocked autoplay. Use the video controls to begin.");
                video.controls = true;
            }
        });
        video.addEventListener("play", sync);
        video.addEventListener("pause", sync);
        video.addEventListener("ended", sync);
    }

    function prepareEnquiry(form) {
        if (!form.reportValidity()) return;
        const data = new FormData(form);
        const name = String(data.get("name") || "").trim();
        const email = String(data.get("email") || "").trim();
        const project = String(data.get("project") || "Interior design enquiry").trim();
        const budget = String(data.get("budget") || "Not specified").trim();
        const message = String(data.get("message") || "").trim();
        const subject = `Interno project enquiry — ${project}`;
        const body = [
            `Hello Interno,`,
            "",
            `My name is ${name}. I would like to discuss: ${project}.`,
            `Estimated budget: ${budget}.`,
            "",
            message,
            "",
            `Reply to: ${email}`
        ].join("\n");

        showToast("Your enquiry is ready — opening your mail app now.");
        window.setTimeout(() => {
            window.location.href = `mailto:hello@interno.studio?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }, 250);
    }

    function initializeForms() {
        document.addEventListener("submit", (event) => {
            const form = event.target.closest(".js-contact-form");
            if (!form) return;
            event.preventDefault();
            prepareEnquiry(form);
        });
    }

    function initializePageTransitions() {
        document.addEventListener("click", (event) => {
            const link = event.target.closest("a[href]");
            if (!link || event.defaultPrevented) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (link.target === "_blank" || link.hasAttribute("download")) return;

            const rawHref = link.getAttribute("href");
            if (!rawHref || rawHref.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(rawHref)) return;

            const target = new URL(link.href, window.location.href);
            if (target.origin !== window.location.origin) return;
            if (target.pathname === window.location.pathname && target.hash) return;
            if (!isMotionEnabled()) return;

            event.preventDefault();
            hideMotionCursor();
            document.body.classList.add("is-leaving");
            window.setTimeout(() => {
                window.location.href = target.href;
            }, 760);
        });
    }

    function showToast(message) {
        const toast = document.querySelector(".toast");
        if (!toast) return;
        window.clearTimeout(state.toastTimer);
        toast.textContent = message;
        toast.classList.add("is-visible");
        state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
    }

    function initializeYear() {
        queryAll("[data-current-year]").forEach((element) => {
            element.textContent = String(new Date().getFullYear());
        });
    }

    function initialize() {
        prepareMotionHeadings();
        initializePhotoMotion();
        initializeReveal();
        createInterface();
        initializeMotionRuntime();
        initializeTheme();
        initializeNavigation();
        initializeDialogs();
        initializeScrollEffects();
        initializeCounters();
        initializeTilt();
        initializeVideo();
        initializeForms();
        initializePageTransitions();
        initializeYear();
    }

    // Runs independently so an early initialization error cannot strand content.
    window.setTimeout(() => {
        if (!state.revealReady) showRevealContent(document, true);
    }, 5000);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
