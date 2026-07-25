// /api/_crm-users.js — учётные записи команды для CRM.
// Имя с _ → Vercel не считает это endpoint'ом.
// Здесь — ПЕРВЫЙ (дефолтный) пароль каждого: salted SHA-256 от 'Demo1234'.
// Пользователь может сменить пароль сам — новый хэш пишется в Supabase (таблица crm_creds)
//   и перекрывает дефолт из этого файла (см. _crm-auth.js).
// Сброс к 'Demo1234' = удалить строку пользователя из crm_creds.

export const DEFAULT_PASSWORD = 'Demo1234';

export const USERS = [
  { login: 'alizhan',  name: 'Алижан',      salt: '7212368c04daddd3e2a0bdd0', hash: '25fc41c84f0611894df8114bdcf9f56125805d54e47c86af7359ac0be37549f4' },
  { login: 'manager1', name: 'Аблай',       salt: '5b728ec23edd0beebcfbfcf7', hash: '564be6fe57f1d34ed34a71c78e3dd59326ce64b20d71db8578dd1a15cc24f1ac' },
  { login: 'manager2', name: 'Алишер',      salt: '1f06f2e7dee76bf2a1842088', hash: '38fbbb054f5e3fc0829b1235acd0500c8affafc9e9faf09b266ae4a1459ef590' },
  { login: 'aizhan',   name: 'Айжан',       salt: '859246ce531937e27448dcd5', hash: '48c7b24e7c0bb6472538b4771b63725497ef7ec10f50f0ffef1c81c4c352d499' },
];
