-- Set receipt header and footer for the Noch Cafe branch
-- Branch ID: 8936e821-ad7f-4d69-b654-c2f76404f89f

UPDATE pos_branches
SET
  receipt_header = 'Noch Cafe - حي الاندلس',
  receipt_footer = 'شكرا لزيارتكم'
WHERE id = '8936e821-ad7f-4d69-b654-c2f76404f89f';
