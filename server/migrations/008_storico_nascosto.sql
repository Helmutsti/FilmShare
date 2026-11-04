-- "Svuota storico": i trasferimenti finiti vengono nascosti dagli elenchi, non cancellati,
-- così la quota del periodo resta corretta e i link di download ancora validi continuano a funzionare.
ALTER TABLE transfers ADD COLUMN hidden_at TEXT;
