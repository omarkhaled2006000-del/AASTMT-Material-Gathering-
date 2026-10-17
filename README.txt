AASTMT Study Hub - files

index.html            The website (upload to the GitHub repo root)
config.js             Your Supabase URL + publishable key (upload to the repo root)
schema.sql            Database setup. Run the WHOLE file once in Supabase > SQL Editor
standalone-version.html  Optional copy of the artifact that stores data in the browser only. Not needed for the live site.

Setup
1. Supabase > Authentication > Providers > Email: turn OFF "Confirm email".
2. Supabase > SQL Editor: run schema.sql (it resets the old test tables).
3. GitHub: upload index.html and config.js to the repo root. Delete the old login.html and supabase-layer.js if present.
4. GitHub > Settings > Pages: Deploy from a branch, main, / (root).
5. Open the site, create your account, then make yourself admin in SQL Editor:
   update public.profiles set role = 'admin' where uid = 'YOUR9DIGITID';
   Log out and back in.
