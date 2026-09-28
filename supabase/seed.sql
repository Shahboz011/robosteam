-- RoboSTEAM academy seed data. Run AFTER supabase/academy-schema.sql. Safe to run again.
-- Rows use fixed ids, so a re-run updates them in place instead of adding duplicates, and never touches
-- anyone's lesson_progress. A re-run resets titles, texts and order to what is written here, but keeps
-- whatever you changed in the dashboard for published, video_path and duration_seconds.

-- Modules ---------------------------------------------------------------------------------------------
insert into public.modules (id, title, description, order_index, published) values
  ('a0000000-0000-4000-8000-000000000001', 'Elektronika asoslari',
   'Elektr zanjiri, kuchlanish, tok va qarshilik. Birinchi zanjiringizni o''zingiz yig''asiz.', 1, true),
  ('a0000000-0000-4000-8000-000000000002', 'Arduino va sensorlar',
   'Arduino platasini dasturlash va sensorlardan ma''lumot o''qish.', 2, false),
  ('a0000000-0000-4000-8000-000000000003', 'Robot yasash',
   'Motorlar, g''ildiraklar va boshqaruv: birinchi robotingizni yig''ish.', 3, false)
on conflict (id) do update
  set title = excluded.title, description = excluded.description, order_index = excluded.order_index;

-- Lessons (module 1) ------------------------------------------------------------------------------------
insert into public.lessons (id, module_id, title, body, video_path, duration_seconds, order_index, published) values
  ('b0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001',
   'Kirish: elektr zanjiri nima?',
   $body$Elektr zanjiri — tok aylanib o'tadigan yopiq yo'l. Zanjir uzilsa, tok to'xtaydi va lampochka o'chadi.

## Zanjirning qismlari
- Manba: batareya yoki quvvat bloki
- O'tkazgich: simlar
- Iste'molchi: lampochka, LED yoki motor
- Kalit: zanjirni ulaydi va uzadi

Darsdan keyin atrofingizdagi uchta qurilmada manba, sim va iste'molchini topib ko'ring.$body$,
   null, null, 1, true),
  ('b0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000001',
   'Kuchlanish, tok va qarshilik',
   $body$Kuchlanish (V, volt) — tokni itaruvchi "bosim". Tok (A, amper) — zanjirdan oqib o'tayotgan zaryad miqdori. Qarshilik (Ω, om) — tokka to'sqinlik.

## Om qonuni
- U = I × R
- Kuchlanish oshsa, tok ham oshadi
- Qarshilik oshsa, tok kamayadi

**Eslab qoling:** LED'ni har doim rezistor bilan ulang, aks holda u kuyib qolishi mumkin.$body$,
   null, null, 2, true),
  ('b0000000-0000-4000-8000-000000000103', 'a0000000-0000-4000-8000-000000000001',
   'Birinchi zanjiringizni yig''ish',
   $body$Endi hammasini birlashtiramiz: batareya, rezistor va LED'dan oddiy zanjir yig'amiz.

## Sizga kerak
- 9 V batareya yoki 5 V quvvat manbai
- 220 Ω rezistor
- 1 ta LED
- Maket plata (breadboard) va simlar

LED'ning uzun oyog'i (+) manbaning musbat tomoniga, qisqa oyog'i rezistor orqali manfiy tomonga ulanadi. LED yonsa — tabriklaymiz, zanjir ishlayapti!$body$,
   null, null, 3, true)
on conflict (id) do update
  set module_id = excluded.module_id, title = excluded.title, body = excluded.body, order_index = excluded.order_index;
