/**
 * Static, monochrome debanding for the FINAL composited surface.
 * 64×64 balanced black/white tile, alpha 1/255 (seed 1979). The texture only
 * perturbs roughly one 8-bit colour step; never increase opacity to hide bands.
 * image-set keeps the grain at device-pixel scale on 1x/2x/3x displays.
 * No animation, blend mode, extra backdrop root, or pointer interception.
 * Keep this file identical in Mini UI and PuPu.
 */
const tile = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAEBElEQVR42q2b204DQQxDh///6CIhgSibyzkeHiqh0r3NJI7jeM855+P783q90Of376vjqnP+/u7vsdW5qr+7e6T3U/3/FF88Duou2l2ge/jpIacF7BayOv92n8V1zrji1c51Ozo98BRp03f0uiaK3j7dibvP9KB0IbYQ7aKyi45tUZZrsYeeFmEKTxKK9PvuXqZo2SLkTLtGsGD6zW00bRG0YdR2za/f2VzvwpWGNgAlhCFTNJIo/fl7AoktrKeo2XCBRBVZqOk3G4g+yuAUgha1t+pCSi4pyTRthojipGUjJBMoTqidpOAN2D4wIN3J7RhDarYcJw9Ny+DbOU0NJ7V4Y352ITfGSTehXTQDRBtq07xPkJ1gyBY9zT2znZ4IxhaWWxgneW+JWrtBG8LT/DK9hMEDAnrbgo7XIO1l0i7fABWJwNtGrCyDabnaaCylx7RPsPcwLiAJHXJR28BsFJzgyYb6sJr4PDMpsYEsqQxEMNkYYbsYZOdo20oFDHJzCa3dwHklQgS1KeEhoWulMRo5tMq07TApjQlCE5SmCE8jCVybMzG7IKbhIflLW+KN2L0dP3FsG05GzaFkilYCmqJjCtAwJyoM1fETsWRjk7QylSB4owIZ4cLwddovRFzB7HYqdxutzoqghnmWC7P11kl5MuJKwv9v5PVVEzRAZEXPpLe/SSfYTxw1i7OaPt1FU0JN+70OSkz9N6Mrk6s00ijrMwPcQ/R3UuPJjIAMUEylseO68l5pP2+UYKP9UdJkyx+55qMbFNMULHdZkLJYQ2lx+x2Rmw1wJdMbIqqmmiDwDfjJ0HYR0rPTxoc0WXZmiCQxg7B0gEmHLAYnKBgPqXt0G2nrsBFPDfiZlBg2ko+xbjQ8Mzu09d4sbmuRsTWaskAjgVOqvZmhZGnmU5UkBWzjYnRJ4zkcecCNMYpyBdppUvk7ldDLuUDi/kxmg6bPoFMl41YbqfDWhCTOraRSGLtb0l22KZD6eShjMzrCTcmNbHJmwmt0QtvxWfBNhJR2LnDru6UPRlQkbG8RrfxolaVihDUjkZE5zlVhw1FAaA3LRo2hIy7aPSZOE4Av3HdDwzFBY2qoMt0mHKScSPOjKH7D7WmakEnROhewhuXUxWVo7e2GoLb7ZiZgBY9kaGL7DGPnRW5xO9ez5mpr1CR+ReNDOvRNDGw5kfKVGW0ljnNQQg9GUuvRpVT61m2SkLgyAkx7a3aVYoHBiNScXZZBa2y07wca05N9+cFuxONebsObAGbiP7ajsiT10AsTNlepqvwf7wcZA9YAjqzkGbc4ZWumm6SmCppW5VzAjqSTmQF9IcqOy9Lm7FDz4X+QJZvTN6N21QwlQkRaAYyb3PgWyGSrOuYTm475WnsAJdoAAAAASUVORK5CYII=";

export const SURFACE_DITHER_STYLE = Object.freeze({
  backgroundImage: `image-set(url("${tile}") 1x, url("${tile}") 2x, url("${tile}") 3x)`,
  backgroundRepeat: "repeat",
});

// Use AFTER any filtered/low-opacity artwork, BEFORE foreground content.
// Putting this inside the blur would average away the tiny variations.
export const SURFACE_DITHER_LAYER_STYLE = Object.freeze({
  ...SURFACE_DITHER_STYLE,
  position: "absolute",
  inset: 0,
  borderRadius: "inherit",
  pointerEvents: "none",
});
