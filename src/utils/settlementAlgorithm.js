export const calculateBalances = (expenses, members) => {
  const balances = {};
  
  // Initialize balances
  members.forEach(member => {
    balances[member.email] = {
      name: member.name,
      email: member.email,
      amount: 0 // positive means they are owed money, negative means they owe money
    };
  });

  // Calculate net balances
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount);
    const paidBy = expense.paidBy;
    
    // The person who paid gets the total amount added to their balance
    if (balances[paidBy]) {
      balances[paidBy].amount += amount;
    }

    // New format: splits object { email: amountOwed }
    if (expense.splits && typeof expense.splits === 'object') {
      Object.entries(expense.splits).forEach(([personEmail, splitAmount]) => {
        if (balances[personEmail]) {
          balances[personEmail].amount -= parseFloat(splitAmount);
        }
      });
    } 
    // Old format: splitBetween array of emails (equal split)
    else if (expense.splitBetween && Array.isArray(expense.splitBetween)) {
      if (expense.splitBetween.length === 0) return;
      const splitAmount = amount / expense.splitBetween.length;
      expense.splitBetween.forEach(personEmail => {
        if (balances[personEmail]) {
          balances[personEmail].amount -= splitAmount;
        }
      });
    }
  });

  return balances;
};

export const calculateSmartSettlements = (balances) => {
  const debtors = [];
  const creditors = [];

  // Separate into those who owe (debtors) and those who are owed (creditors)
  Object.values(balances).forEach(person => {
    const amount = Math.round(person.amount * 100) / 100; // Round to 2 decimals
    if (amount < -0.01) {
      debtors.push({ ...person, amount: Math.abs(amount) });
    } else if (amount > 0.01) {
      creditors.push({ ...person, amount });
    }
  });

  // Sort descending by amount to optimize the settlement (Greedy approach)
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0; // debtors index
  let j = 0; // creditors index

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settledAmount = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor,
      to: creditor,
      amount: Math.round(settledAmount * 100) / 100
    });

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;

    // Move to next if settled
    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
};
