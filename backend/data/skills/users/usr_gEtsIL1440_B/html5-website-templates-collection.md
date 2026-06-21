---
id: html5-website-templates-collection
name: 150+ HTML5 Website Templates Collection
description: Browse and use 170+ free HTML5 website templates for every purpose: business, portfolio, restaurant, hotel, education, real estate, coming soon, and more. All pure HTML/CSS/JS, no build tools.
---

# 150+ HTML5 Website Templates Collection

Browse and use **170+ free HTML5 website templates** for every purpose. All pure HTML/CSS/JS with Bootstrap — no build tools required.

**GitHub:** https://github.com/learning-zone/website-templates
**Live Previews:** https://learning-zone.github.io/website-templates/
**Stars:** ~6,000 | **License:** MIT

## What You Get

- **170+ templates** — Business, portfolio, restaurant, hotel, education, real estate, coming soon, admin, photography, wedding, and more
- **Responsive design** — All templates use Bootstrap
- **Pure HTML/CSS/JS** — No build step, just open and edit
- **Live demos** — Each template has a working preview
- **Categorized** — Easy to browse by type

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/learning-zone/website-templates.git
cd website-templates
```

### 2. Browse templates

```bash
# List all template directories
ls -la
```

Each directory is a standalone template.

### 3. Open a template

```bash
# Navigate to a template
cd restaurant-template-name

# Open its index.html
open index.html        # macOS
start index.html       # Windows
xdg-open index.html    # Linux
```

## Featured Templates by Category

### Business / Corporate
| Template | Description |
|----------|-------------|
| `atlanta-free-business-bootstrap-template` | Clean business site |
| `businessline-corporate-portfolio-bootstrap` | Corporate portfolio |
| `enlive-corporate-free-html5-bootstrap-web-template` | Corporate website |
| `creative-bee-corporate-free-html5-web-template` | Creative agency |
| `swifty-business-html5-website-template` | Modern business |

### Portfolio / Resume
| Template | Description |
|----------|-------------|
| `iam-html5-responsive-portfolio-resume-template` | Personal resume |
| `johndoe-portfolio-resume-bootstrap-template` | Portfolio + resume |
| `responsive-portfolio-website` | Clean portfolio |
| `free-portfolio-html5-responsive-website-sam` | Minimal portfolio |
| `wow-portfolio-multi-purpose-html5-template` | Multi-purpose |

### Restaurant / Food
| Template | Description |
|----------|-------------|
| `bestro-restaurant-bootstrap-html5-template` | Restaurant website |
| `eat-restaurant-bootstrap-html5-template` | Food & dining |
| `coffee-shop-free-html5-template` | Coffee shop |
| `treehut-restaurant-bootstrap-template` | Restaurant theme |

### Real Estate
| Template | Description |
|----------|-------------|
| `aerosky-real-estate-html-responsive-template` | Property listings |
| `city-square-bootstrap-responsive-web-template` | Real estate |
| `icon-real-estate-developers-free-html-template` | Developers |
| `my-home-real-estate-bootstrap-template` | Home listings |

### Education
| Template | Description |
|----------|-------------|
| `b-school-free-education-html5-website-template` | Business school |
| `learn-educational-free-responsive-web-template` | Education site |
| `school-educational-html5-template` | School website |
| `victory-educational-institution-html5-template` | Institution |

### Coming Soon / Landing
| Template | Description |
|----------|-------------|
| `ace-responsive-coming-soon-template` | Coming soon |
| `brand-html5-app-landing-page-responsive-template` | App landing |
| `mobile-app-landing-page-html5-template` | Mobile app page |
| `clouds-html5-multipurpose-landing-page-template` | Multi-purpose |

### Special Interest
| Template | Description |
|----------|-------------|
| `amaze-photography-bootstrap-html5-template` | Photography |
| `lovely-wedding-bootstrap-free-website-template` | Wedding |
| `aroma-beauty-and-spa-responsive-bootstrap-template` | Beauty & spa |
| `car-zone-automobile-bootstrap-template` | Auto dealership |
| `fitness-zone-html5-bootstrap-template` | Gym & fitness |
| `medplus-medical` | Medical/healthcare |

## Customizing a Template

### 1. Edit the HTML

Open `index.html` in any code editor. Key sections to customize:

```html
<!-- Brand/logo -->
<a class="navbar-brand" href="#">Your Brand</a>

<!-- Hero text -->
<h1>Your Headline Here</h1>
<p>Your subtext here</p>

<!-- Images -->
<img src="assets/images/your-image.jpg" alt="Description">
```

### 2. Change colors

Most templates use Bootstrap's CSS classes. Override in a custom CSS file:

```css
/* Add your custom styles in a new file: custom.css */
.navbar {
  background-color: #your-color !important;
}
.btn-primary {
  background-color: #your-color;
  border-color: #your-color;
}
```

### 3. Replace images

Each template has an `assets/` or `images/` folder. Swap out the placeholder images with your own.

### 4. Update links

Find and replace social media links, navigation URLs, and contact information.

## Finding the Right Template

```bash
# Search by keyword
ls -d *restaurant*    # Find restaurant templates
ls -d *portfolio*     # Find portfolio templates
ls -d *business*      # Find business templates
ls -d *education*     # Find education templates
```

## Deploying

All templates are static — deploy anywhere:

```bash
# Just upload the template folder to any web host
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Layout broken | Ensure Bootstrap CSS is loaded (check CDN links) |
| Images broken | Check relative paths — most images are in `assets/` |
| Template not responsive | Verify the `<meta viewport>` tag is present |
| Fonts not loading | Check font CDN URLs in the `<head>` section |
| Too many templates | Use `ls -d *keyword*` to filter by category |
