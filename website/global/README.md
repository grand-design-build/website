# global — change it here, it changes everywhere

Before you edit anything in `webpages/`, check whether it belongs here instead.

| You want to change | Edit |
|---|---|
| A colour, anywhere on the site | `styles/tokens.css` |
| How buttons / cards / the nav look | `styles/site.css` |
| Phone number, address, hours | `content/site.json` |
| A menu item | `partials/header.html` + `content/site.json` |
| Anything in the footer | `partials/footer.html` |
| Fonts, tracking code | `partials/head.html` |
| The business name, address, rating Google reads | `partials/schema.html` |
| How the pencil cursor feels | `scripts/motion.js` (the `CFG` block) |
| Reveals, blueprint, magnetic buttons | `styles/motion.css` + `scripts/motion.js` |
| Starting point for a new page | `templates/page.html` |
| Starting point for a new neighbourhood page | `templates/location.html` |
| Starting point for a new article | `templates/blog-post.html` |

If you are about to make the same edit on two pages, it belongs in one of these files.
