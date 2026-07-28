# 🚀 OG BEATZ Vault — Complete Application Setup & InfinityFree Hosting Guide

This manual provides production compilation instructions, architectural setup procedures, and a specialized step-by-step guide for hosting the **OG BEATZ Vault** client-side single page application (SPA) on **InfinityFree** for free.

---

## 📋 1. Complete Application Setup (Local & Production-Ready)

### Prerequisites
* **Node.js**: Version 18.x or greater is required.
* **npm**: Version 9.x or greater.
* **Database (Optional/Recommended)**: A Supabase account or PostgreSQL instance.

### Step 1: Clone or Extract the App
Place all folder assets in your target folder catalog. Make sure the following workspace files exist:
```text
ogbeatz-vault/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── index.css
│   ├── App.tsx
│   └── (sub-directories)
```

### Step 2: Install Package Dependencies
Open your shell terminal in the project root directory and install dependencies:
```bash
npm install
```
*This installs core production systems including `lucide-react`, `recharts`, and `motion` along with Vite developer bundles.*

### Step 3: Configure Environment Variables
Create a file named `.env` in the root directory (based on `.env.example`):
```env
# Supabase Database Keys
VITE_SUPABASE_URL=https://your-supabase-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-client-safe-anon-public-key

# AI Custom Grounding
VITE_GEMINI_API_KEY=your-client-side-optional-gemini-key
```
*Note: During build compilation, Vite embeds these `VITE_` variables directly into the compiled JavaScript files, making them accessible to your browser client sandbox on the live web server.*

### Step 4: Run Development Server
To launch the hot-reloading development server locally:
```bash
npm run dev
```
The application will boot on **http://localhost:3000** (or your specified port).

---

## 🏗️ 2. Production Build & Compilation

To compile the entire React TypeScript codebase into highly-minified, static web assets:
```bash
npm run build
```

This triggers the Vite compiler to produce a **`dist/`** directory containing:
* `index.html`: The primary root markup index file.
* `assets/`: Highly compressed and bundled `.js` and `.css` files.
* Secondary assets (such as vector artwork or local MP3 mock loaders).

---

## 🌐 3. InfinityFree Hosting Deployment Guide

**InfinityFree** is a popular, high-uptime free web hosting service. Because InfinityFree operates on Apache-driven web environments designed for PHP, we deploy our compiled, static web assets into their target public catalog (`htdocs`), adding specialized URL routing configurations.

### ⚠️ Critical Requirement: SPA Routing Re-Direct Rules
React uses client-side routing. If a visitor lands directly on a sub-route (e.g. `yourdomain.rf.gd/share/your_token`) or presses **Reload** (F5) in their browser on a sub-page, Apache will return a standard **404 Not Found** error because the `/share/...` folder does not exist physically on the server.

To fix this, we must configure a custom **`.htaccess`** file to redirect all virtual requests to our root `index.html` file.

---

### Step-by-Step InfinityFree Deployment Map

#### Step A: Register the InfinityFree hosting workspace
1. Go to [InfinityFree](https://infinityfree.com) and sign up for a free account.
2. In the Client Area, click **Create Account**.
3. Choose a custom domain name or choose a free subdomain under domains like `rf.gd` or `epizy.com` (e.g. `ogbeatz-vault.rf.gd`).
4. Complete the account setup and wait a few minutes for the server shell setup to finish status verification.

#### Step B: Establish the Apache Redirection Configuration
1. Locally in your computer, create a new file inside your project's `/public` folder (or directly inside the build output `/dist` folder) named `.htaccess` (with a leading dot, no file extension).
2. Paste the following rewrite rules directly inside the `.htaccess` file:
   ```apache
   # ====================================================================
   # OG BEATZ VAULT - REACT ROUTER APACHE OVERRIDES
   # Redirects all incoming virtual routes safely to our root index.html
   # ====================================================================
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /
     
     # If the requested query is a real file or real folder, serve it directly
     RewriteCond %{REQUEST_FILENAME} -f [OR]
     RewriteCond %{REQUEST_FILENAME} -d
     RewriteRule ^ - [L]
     
     # Otherwise, rewrite all paths to index.html so React Router handles the route
     RewriteRule ^index\.html$ - [L]
     RewriteRule . /index.html [L]
   </IfModule>
   ```
3. Save the file. (Placing it in the `/public` folder guarantees Vite automatically copies `.htaccess` to `/dist` on succeeding builds).

#### Step C: Run the Production Build
Ensure your Supabase keys are securely set in your local `.env`, then build the codebase:
```bash
npm run build
```
Confirm that the generated `dist/` folder contains your built folders, `index.html`, and the `.htaccess` file you created.

#### Step D: Upload Compiled Assets via FTP or File Manager
1. Log in to the InfinityFree Client Area.
2. Go to **FTP Details** under your account page and copy your:
   * **FTP Username** (e.g., `if0_12345678`)
   * **FTP Password**
   * **FTP Hostname** (e.g., `ftpupload.net`)
3. Open an FTP client like **FileZilla** and establish a connection. Alternatively, click **Online File Manager** directly inside the InfinityFree dashboard layout.
4. Navigate inside the **`htdocs/`** directory. (Delete any pre-placed default setup files like `index2.html` or `default.php` if present!).
5. Drag and upload **only the contents** inside your local `dist/` directory directly into the online `/htdocs/` directory.
   
   *Your online FTP paths should look like:*
   ```text
   /htdocs/.htaccess
   /htdocs/index.html
   /htdocs/assets/index-xxxxxxxx.css
   /htdocs/assets/index-xxxxxxxx.js
   ```

#### Step E: Test and Confirm Web Operations
1. Open your designated web domain (e.g., `http://ogbeatz-vault.rf.gd`) in a live browser window.
2. Verify visual operations, interactive playlists, and track uploads.
3. Browse to a sub-route (like clicking a share review link or messaging profile) and reload (F5) the browser to verify the `.htaccess` rewrite rules route successfully back into the SPA shell dashboard with zero 404 blockages.

Congratulations! Your high-fidelity OG BEATZ Console is now successfully serving production-grade audio reviews live on InfinityFree!
