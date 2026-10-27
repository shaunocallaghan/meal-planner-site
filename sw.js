// Service worker for the public site (template; build-site fills in the
// placeholders). It only ever handles this site's own public files.
//
// Network first, so a new deploy shows on the next open; the cached copy is
// the fallback, used straight away when offline or if the network is slow,
// so the installed app still opens in a shop with no signal.
const VERSION = '3a8fddbee51cf2c7'
const FILES = ["./","app-keyring.json","app.bin","apple-touch-icon.png","assets/familjen-grotesk-latin-700-normal-Cqh4U_Q6.woff","assets/familjen-grotesk-latin-700-normal-DP3KK2u2.woff2","assets/gate-Bg8huPeA.js","assets/gate-DBGZifvT.css","assets/manrope-latin-600-normal-4f0koTD-.woff2","assets/manrope-latin-600-normal-BqgrALkZ.woff","favicon.png","food/LICENSE.txt","food/avocado.webp","food/baby_bottle.webp","food/bacon.webp","food/bagel.webp","food/baguette_bread.webp","food/banana.webp","food/basket.webp","food/battery.webp","food/beans.webp","food/beer_mug.webp","food/bell_pepper.webp","food/beverage_box.webp","food/blueberries.webp","food/bowl_with_spoon.webp","food/bread.webp","food/broccoli.webp","food/brown_mushroom.webp","food/bubble_tea.webp","food/bubbles.webp","food/butter.webp","food/candy.webp","food/canned_food.webp","food/carrot.webp","food/cheese_wedge.webp","food/cherries.webp","food/chestnut.webp","food/chocolate_bar.webp","food/cocktail_glass.webp","food/coconut.webp","food/cooked_rice.webp","food/cookie.webp","food/croissant.webp","food/cucumber.webp","food/cup_with_straw.webp","food/cupcake.webp","food/curry_rice.webp","food/custard.webp","food/cut_of_meat.webp","food/dumpling.webp","food/ear_of_corn.webp","food/egg.webp","food/eggplant.webp","food/fish.webp","food/flatbread.webp","food/fork_and_knife_with_plate.webp","food/french_fries.webp","food/fried_shrimp.webp","food/garlic.webp","food/ginger_root.webp","food/glass_of_milk.webp","food/grapes.webp","food/green_salad.webp","food/herb.webp","food/honey_pot.webp","food/hot_beverage.webp","food/hot_dog.webp","food/hot_pepper.webp","food/ice.webp","food/ice_cream.webp","food/jar.webp","food/kiwi_fruit.webp","food/leafy_green.webp","food/lemon.webp","food/lotion_bottle.webp","food/mango.webp","food/meat_on_bone.webp","food/melon.webp","food/olive.webp","food/onion.webp","food/package.webp","food/pancakes.webp","food/pea_pod.webp","food/peach.webp","food/peanuts.webp","food/pear.webp","food/pie.webp","food/pineapple.webp","food/pizza.webp","food/popcorn.webp","food/pot_of_food.webp","food/potable_water.webp","food/potato.webp","food/poultry_leg.webp","food/pouring_liquid.webp","food/pretzel.webp","food/red_apple.webp","food/rice_cracker.webp","food/roasted_sweet_potato.webp","food/roll_of_paper.webp","food/salt.webp","food/seedling.webp","food/sheaf_of_rice.webp","food/shopping_bags.webp","food/shopping_cart.webp","food/shortcake.webp","food/shrimp.webp","food/soap.webp","food/spaghetti.webp","food/sponge.webp","food/steaming_bowl.webp","food/strawberry.webp","food/taco.webp","food/tangerine.webp","food/teacup_without_handle.webp","food/teapot.webp","food/test_tube.webp","food/tomato.webp","food/toothbrush.webp","food/tumbler_glass.webp","food/waffle.webp","food/wastebasket.webp","food/watermelon.webp","food/wine_glass.webp","icon-192.png","icon-512.png","icon-maskable-512.png","manifest.webmanifest","vendor/zxing_reader.wasm"]
// The OCR engine and English data (~7 MB) are fetched on first Photo use and
// kept in their own cache, which survives app deploys until they change.
const OCR_CACHE = 'ocr-05273044e7623a28'
const OCR_PREFIX = 'ocr/'
const NETWORK_TIMEOUT_MS = 3000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION && key !== OCR_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

const fromCache = async (cache, request) =>
  (await cache.match(request, { ignoreSearch: true })) ?? (request.mode === 'navigate' ? await cache.match('./') : undefined)

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.url.startsWith(new URL(OCR_PREFIX, self.registration.scope).href)) {
    event.respondWith(
      caches.open(OCR_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true })
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      }),
    )
    return
  }
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      // Revalidate with the server (a 304 is cheap) rather than trusting the HTTP cache.
      // A page navigation can't be re-issued with new options, so it's rebuilt from its URL.
      const fresh = request.mode === 'navigate' ? new Request(request.url, { cache: 'no-cache' }) : new Request(request, { cache: 'no-cache' })
      const network = fetch(fresh).then((response) => {
        if (response.ok) void cache.put(request.mode === 'navigate' ? './' : request, response.clone())
        return response
      })
      const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS))
      try {
        const response = await Promise.race([network, timeout])
        if (response) return response
      } catch {
        // Offline: fall through to the cached copy.
      }
      return (await fromCache(cache, request)) ?? network
    }),
  )
})
