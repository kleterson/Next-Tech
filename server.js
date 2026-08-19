const express = require('express');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json());

// ==========================================
// CONFIGURAÇÃO DO MERCADO PAGO (Dinâmica)
// ==========================================
let currentAccessToken = process.env.MP_ACCESS_TOKEN || 'APP_USR-517824253559090-073117-47dad5ef4352fb0abd9e5d717275dfa3-71867761';
let currentPublicKey = process.env.MP_PUBLIC_KEY || '';

let client = new MercadoPagoConfig({ 
    accessToken: currentAccessToken 
});

// Rota para atualizar os tokens via Painel Admin com validação robusta
app.post('/api/update-token', (req, res) => {
    const { token, publicKey } = req.body;
    
    if (!token) {
        return res.status(400).json({ success: false, message: 'O token é obrigatório.' });
    }

    try {
        currentAccessToken = token;
        if (publicKey) {
            currentPublicKey = publicKey;
        }

        // Recria a instância do Mercado Pago com o novo token enviado pelo Admin
        client = new MercadoPagoConfig({ accessToken: currentAccessToken });

        console.log('Credenciais do Mercado Pago atualizadas com sucesso via painel admin!');
        return res.json({ success: true, message: 'Configurações salvas e atualizadas com sucesso no servidor!' });
    } catch (error) {
        console.error('Erro ao atualizar credenciais do Mercado Pago:', error);
        return res.status(500).json({ success: false, message: 'Erro ao aplicar o novo token.' });
    }
});

// Rota para o frontend pegar a Public Key configurada
app.get('/api/mercado-pago-key', (req, res) => {
    res.json({ publicKey: currentPublicKey });
});

// Rota para criar preferência de pagamento (Checkout Pro)
app.post('/api/create-preference', async (req, res) => {
    try {
        const { items } = req.body;
        const preference = new Preference(client);
        const result = await preference.create({
            body: {
                items: items.map(item => ({
                    title: item.name || item.title,
                    unit_price: Number(item.price || item.unit_price),
                    quantity: Number(item.quantity),
                    currency_id: 'BRL'
                })),
                back_urls: {
                    success: `${req.protocol}://${req.get('host')}/index.html`,
                    failure: `${req.protocol}://${req.get('host')}/index.html`,
                    pending: `${req.protocol}://${req.get('host')}/index.html`
                }
            }
        });
        res.json({ id: result.id, init_point: result.init_point });
    } catch (error) {
        console.error('Erro ao criar preferência:', error);
        res.status(500).json({ error: 'Erro interno ao processar o pagamento' });
    }
});

// Rota para processar o pagamento (Cartão e Pix direto)
app.post('/api/process-payment', async (req, res) => {
    try {
        const { formData, dadosEntrega } = req.body;
        const payment = new Payment(client);
        
        let bodyData = {
            transaction_amount: Number(formData.transaction_amount),
            description: 'Compra NextTech - ' + (dadosEntrega?.nome || 'Cliente'),
            payment_method_id: formData.payment_method_id,
            payer: {
                email: formData.payer?.email || dadosEntrega?.email || 'comprador@email.com',
                first_name: dadosEntrega?.nome ? dadosEntrega.nome.split(' ')[0] : 'Cliente',
                last_name: dadosEntrega?.nome ? dadosEntrega.nome.split(' ').slice(1).join(' ') : 'NextTech',
                identification: {
                    type: formData.payer?.identification?.type || 'CPF',
                    number: String(formData.payer?.identification?.number || '12345678909').replace(/\D/g, '')
                },
                address: {
                    street_name: dadosEntrega?.endereco || 'Rua Principal',
                    street_number: String(dadosEntrega?.numero || '123'),
                    zip_code: String(dadosEntrega?.cep || '01001000').replace(/\D/g, '')
                }
            }
        };

        if (formData.payment_method_id === 'pix') {
            bodyData.payment_method_id = 'pix';
        } else {
            bodyData.token = formData.token;
            bodyData.installments = Number(formData.installments || 1);
            bodyData.issuer_id = formData.issuer_id ? Number(formData.issuer_id) : undefined;
        }

        const response = await payment.create({ body: bodyData });
        
        res.json({ 
            status: response.status, 
            id: response.id,
            status_detail: response.status_detail,
            point_of_interaction: response.point_of_interaction 
        });
    } catch (error) {
        console.error('Erro detalhado ao processar pagamento:', error);
        res.status(500).json({ error: error.message || 'Erro ao processar pagamento' });
    }
});

// Rota para checar status do pagamento Pix em tempo real
app.get('/api/check-payment/:id', async (req, res) => {
    try {
        const paymentId = req.params.id;
        const payment = new Payment(client);
        const response = await payment.get({ id: paymentId });
        
        res.json({
            status: response.status,
            status_detail: response.status_detail
        });
    } catch (error) {
        console.error('Erro ao verificar status do pagamento:', error);
        res.status(500).json({ error: 'Erro ao consultar pagamento' });
    }
});

// ==========================================
// ROTAS DO CARRINHO
// ==========================================
let cartItems = [];

app.get('/api/cart', (req, res) => { res.json(cartItems); });
app.post('/api/cart', (req, res) => {
    const { id, name, price, quantity, image } = req.body;
    const existingItem = cartItems.find(item => item.id === id);
    if (existingItem) existingItem.quantity += quantity || 1;
    else cartItems.push({ id, name, price, quantity: quantity || 1, image });
    res.json({ success: true, cart: cartItems });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando perfeitamente em http://localhost:${PORT}`);
});