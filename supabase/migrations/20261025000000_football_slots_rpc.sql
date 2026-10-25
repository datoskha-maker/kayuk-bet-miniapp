-- KAYUK BET: atomic virtual slot spin
-- Run in Supabase SQL Editor on the test project before using the test branch.

CREATE OR REPLACE FUNCTION public.spin_football_slots(
  p_user_id uuid,
  p_stake bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance bigint;
  v_roll integer;
  v_symbols text[];
  v_payout bigint := 0;
  v_jackpot boolean := false;
BEGIN
  IF p_stake IS NULL OR p_stake NOT IN (10, 20, 30, 50, 100) THEN
    RAISE EXCEPTION 'Invalid stake';
  END IF;

  SELECT b.balance
    INTO v_balance
    FROM public.balances AS b
   WHERE b.user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  IF v_balance < p_stake THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- All money movement and history writes happen in this transaction.
  UPDATE public.balances
     SET balance = balance - p_stake,
         updated_at = now()
   WHERE user_id = p_user_id
   RETURNING balance INTO v_balance;

  INSERT INTO public.transactions (user_id, amount, type, note)
  VALUES (p_user_id, -p_stake, 'bet_placed', 'Ставка в слотах КАЮК BET');

  v_roll := floor(random() * 100000)::integer + 1;

  IF v_roll = 1 THEN
    v_symbols := ARRAY['👑', '👑', '👑'];
    v_payout := p_stake * 500;
    v_jackpot := true;
  ELSIF v_roll <= 1000 THEN
    v_symbols := ARRAY['💎', '💎', '💎'];
    v_payout := p_stake * 20;
  ELSIF v_roll <= 3000 THEN
    v_symbols := ARRAY['⭐', '⭐', '⭐'];
    v_payout := p_stake * 10;
  ELSIF v_roll <= 7000 THEN
    v_symbols := ARRAY['🍒', '🍒', '🍒'];
    v_payout := p_stake * 5;
  ELSIF v_roll <= 22000 THEN
    CASE floor(random() * 4)::integer
      WHEN 0 THEN v_symbols := ARRAY['🍒', '🍒', '🍋'];
      WHEN 1 THEN v_symbols := ARRAY['🍋', '⭐', '🍋'];
      WHEN 2 THEN v_symbols := ARRAY['💎', '💎', '🍋'];
      ELSE v_symbols := ARRAY['⭐', '🍋', '⭐'];
    END CASE;
    v_payout := p_stake * 2;
  ELSE
    CASE floor(random() * 5)::integer
      WHEN 0 THEN v_symbols := ARRAY['🍒', '🍋', '⭐'];
      WHEN 1 THEN v_symbols := ARRAY['🍋', '💎', '🍒'];
      WHEN 2 THEN v_symbols := ARRAY['⭐', '🍒', '💎'];
      WHEN 3 THEN v_symbols := ARRAY['💎', '⭐', '🍋'];
      ELSE v_symbols := ARRAY['🍋', '🍒', '💎'];
    END CASE;
  END IF;

  IF v_payout > 0 THEN
    UPDATE public.balances
       SET balance = balance + v_payout,
           updated_at = now()
     WHERE user_id = p_user_id
     RETURNING balance INTO v_balance;

    INSERT INTO public.transactions (user_id, amount, type, note)
    VALUES (
      p_user_id,
      v_payout,
      'bet_won',
      CASE WHEN v_jackpot
        THEN 'ДЖЕКПОТ в слотах КАЮК BET ×500'
        ELSE 'Выигрыш в слотах КАЮК BET'
      END
    );
  END IF;

  INSERT INTO public.slot_spins (user_id, stake, symbols, payout, jackpot)
  VALUES (p_user_id, p_stake, v_symbols, v_payout, v_jackpot);

  RETURN jsonb_build_object(
    'stake', p_stake,
    'symbols', to_jsonb(v_symbols),
    'payout', v_payout,
    'jackpot', v_jackpot,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spin_football_slots(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spin_football_slots(uuid, bigint) FROM anon;
REVOKE ALL ON FUNCTION public.spin_football_slots(uuid, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.spin_football_slots(uuid, bigint) TO service_role;
