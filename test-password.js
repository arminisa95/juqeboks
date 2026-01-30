const bcrypt = require('bcryptjs');

// Hash the correct password
const plainPassword = 'admin123';
const hashedPassword = bcrypt.hashSync(plainPassword, 10);

console.log('Plain password:', plainPassword);
console.log('Hashed password:', hashedPassword);

// Test the hash
const isValid = bcrypt.compareSync(plainPassword, hashedPassword);
console.log('Hash is valid:', isValid);
