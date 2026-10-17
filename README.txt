AASTMT Study Hub - files

index.html               The website (upload to the GitHub repo root)
config.js                Your Supabase URL + publishable key (upload to the repo root)
schema.sql               Database setup. Run the WHOLE file once. If you already ran it, run only the block at the bottom marked "Email + password reset update"
standalone-version.html  Optional browser-only copy of the artifact. Not needed for the live site.

Setup
1. Supabase > Authentication > Providers > Email: keep "Confirm email" OFF (or ON once SMTP works).
2. Supabase > Authentication > URL Configuration: set Site URL to your GitHub Pages address and add it under Redirect URLs.
3. Supabase > Authentication > SMTP Settings: add a custom SMTP provider so reset emails reach every student.
4. Run schema.sql in the SQL Editor.
5. Upload index.html and config.js to the GitHub repo root (delete old login.html / supabase-layer.js).
6. Create your account, then make yourself admin:
   update public.profiles set role = 'admin' where uid = 'YOUR9DIGITID';
