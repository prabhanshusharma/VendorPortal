const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length > 0) {
    env[key.trim()] = values.join('=').trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  const { data: vendors, error: vErr } = await supabase.from('vendors').select('*');
  console.log('Vendors:', vendors, vErr);

  const { data: pos, error: pErr } = await supabase.from('purchase_orders').select('*');
  console.log('POs:', pos, pErr);
}

checkData();
