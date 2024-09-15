const express = require('express');
const { connectToDatabase, sql } = require('../db');
const verifyToken = require('../middleware/verifyToken');
const router = express.Router();

// Create Order API
router.post('/create', verifyToken, async (req, res) => {
    const { product_id, store_id, qty, unit, sell_price, discount } = req.body;

    try {
        // Ensure a connection pool is available
        const pool = await connectToDatabase();
        const request = new sql.Request(pool);

        // Extract user_id from decoded token (set in the verifyToken middleware)
        const user_id = req.userId;

        // Check if store_id exists in the medical_store table
        const storeResult = await request
            .input('store_id', sql.Int, store_id)
            .query('SELECT * FROM medical_store WHERE store_id = @store_id');

        if (storeResult.recordset.length === 0) {
            return res.status(400).json({ message: 'Store does not exist' });
        }

        // Check if product_id exists in the inventory table
        const productResult = await request
            .input('product_id', sql.Int, product_id)
            .query('SELECT * FROM inventory WHERE product_id = @product_id');

        if (productResult.recordset.length === 0) {
            return res.status(400).json({ message: 'Product does not exist' });
        }

        const product = productResult.recordset[0];

        // Check if qty in order is less than or equal to qty in inventory
        if (product.qty < qty || product.unit !== unit) {
            return res.status(400).json({
                message: 'Insufficient quantity in inventory or unit mismatch'
            });
        }

        // Insert the new order
        await request
            .input('product_id', sql.Int, product_id)
            .input('user_id', sql.Int, user_id) // Set the logged-in user's ID
            .input('store_id', sql.Int, store_id)
            .input('qty', sql.Int, qty)
            .input('unit', sql.VarChar, unit)
            .input('sell_price', sql.Decimal(10, 2), sell_price)
            .input('discount', sql.Decimal(10, 2), discount)
            .input('order_date', sql.DateTime, new Date())
            .query(`
                INSERT INTO [order] 
                (product_id, user_id, store_id, qty, unit, sell_price, discount, order_date) 
                VALUES (@product_id, @user_id, @store_id, @qty, @unit, @sell_price, @discount, @order_date)
            `);

        // Update the inventory by reducing the qty
        await request
            .input('product_id', sql.Int, product_id)
            .input('new_qty', sql.Int, product.qty - qty)
            .query('UPDATE inventory SET qty = @new_qty WHERE product_id = @product_id');

        res.status(201).json({ message: 'Order created successfully' });

    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ message: 'Error creating order' });
    }
});

module.exports = router;
