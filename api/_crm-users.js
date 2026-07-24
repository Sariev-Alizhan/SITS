// /api/_crm-users.js — учётные записи команды для CRM.
// Имя с _ → Vercel не считает это endpoint'ом.
// Пароли НЕ хранятся: только salted SHA-256 (salt+password). Плейнтекст — у владельца.
// Чтобы сменить пароль/добавить сотрудника — сгенерировать новый salt+hash и заменить запись.

export const USERS = [
  { login: 'alizhan',  name: 'Алижан',      salt: '7212368c04daddd3e2a0bdd0', hash: '25fc41c84f0611894df8114bdcf9f56125805d54e47c86af7359ac0be37549f4' },
  { login: 'manager1', name: 'Аблай',       salt: '5b728ec23edd0beebcfbfcf7', hash: '564be6fe57f1d34ed34a71c78e3dd59326ce64b20d71db8578dd1a15cc24f1ac' },
  { login: 'manager2', name: 'Алишер',      salt: '1f06f2e7dee76bf2a1842088', hash: '38fbbb054f5e3fc0829b1235acd0500c8affafc9e9faf09b266ae4a1459ef590' },
];
