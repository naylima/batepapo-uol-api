import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import joi from 'joi';
import express from 'express';
import cors from 'cors';

const app = express();

dotenv.config();
app.use(cors()); 
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
	db = mongoClient.db('batepapouolapi');
});

app.post('/participants', async (req, res) => {

    const { name } = req.body;
    const time = dayjs().format('h:mm:ss');


    const userSchema = joi.object ({
        name: joi.string().required().empty(' ')
    });

    const validation = userSchema.validate(req.body);

    if (validation.error) {
        return res.status(422).send(validation.error.details[0].message);
    }

    try {

        const user = await db.collection('participants').findOne({ name });

        if (user) {
            return res.status(409).send('Esse usuário já existe!');
        }
        
        const participant = await db
            .collection('participants')
            .insertOne({name, lastStatus: Date.now()});

        const message = await db
            .collection('messages')
            .insertOne({
                from: name, 
                to: 'todos', 
                text: 'entra na sala...', 
                type: 'status', 
                time: time
            });

        return res.sendStatus(201);

    } catch (error) {
        
        return res.sendStatus(500);

    }

});

app.get('/participants', async (req, res) => {
    
    try {

        const participants = await db.collection('participants').find().toArray();
        return res.status(201).send(participants);

    } catch (error) {

        return res.sendStatus(500);
        
    }

});

app.post('/messages', async (req, res) => {

    const { user : from } = req.headers;
    const { to, text, type } = req.body;
    const time = dayjs().format('h:mm:ss');

    const userSchema = joi.object ({
        to: joi.string().required().empty(' '),
        text: joi.string().required().empty(' '),
        type: joi.string().valid('message').valid('private_message').required()
    });

    const validation = userSchema.validate(req.body, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail => detail.message));
        return res.status(422).send(errors);
    }

    try {

        const user = await db.collection('participants').findOne({"name": from});

        if (!user) {
            return res.status(422).send('Usuário não encontrado!');
        }

        const insertedMessage = await db
            .collection('messages')
            .insertOne({ to, text, type, from, time });

        return res.sendStatus(201);

    } catch (error) {
        
        return res.sendStatus(500);
    }


});

app.get('/messages', async (req, res) => {

    const { user : from } = req.headers;
    const { limit } = req.query;

    const userSchema = joi.object ({
        limit: joi.number().integer().min(1)
    });

    const validation = userSchema.validate(req.query);

    if (validation.error) {
        return res.status(422).send(validation.error.details[0].message);
    }

    try {

        const messages = await db
            .collection('messages')
            .find({ $or: [
                {"type": "message"}, 
                {"type": "status"}, 
                {"from": from}, 
                {"to": from}
            ]})
            .toArray();

        if ( limit ) {
            return res.status(201).send(messages.slice(-limit));
        }

        return res.status(201).send(messages);

    } catch (error) {

        return res.sendStatus(500);
        
    }    

});

app.delete('/messages/:ID_DA_MENSAGEM', async (req, res) => {

    const { user : name } = req.headers;
    const { ID_DA_MENSAGEM } = req.params;

    try {

        const message = await db
            .collection('messages')
            .findOne({ "_id": ObjectId(ID_DA_MENSAGEM)});

        if (!message) {
            return res.status(404).send('Mensagem não encontrada!');
        }

        if (message.from !== name) {
            return res.status(404).send('Esse usuário não pode realizar essa ação!');
        }

        const deleteMessage = await db
            .collection('messages')
            .deleteOne({ _id: ObjectId(ID_DA_MENSAGEM)});

        return res.sendStatus(200);
        
    } catch (error) {
    
        res.sendStatus(500);

    }

});

app.put('/messages/:ID_DA_MENSAGEM', async (req, res) => {

    const { user : from } = req.headers;
    const { to, text, type } = req.body;
    const { ID_DA_MENSAGEM } = req.params;

    const userSchema = joi.object ({
        to: joi.string().required().empty(' '),
        text: joi.string().required().empty(' '),
        type: joi.string().valid('message').valid('private_message').required()
    });

    const validation = userSchema.validate(req.body, { abortEarly: false });

    if (validation.error) {
        const errors = validation.error.details.map((detail => detail.message));
        return res.status(422).send(errors);
    }

    try {

        const message = await db
            .collection('messages')
            .findOne({ "_id": ObjectId(ID_DA_MENSAGEM)});

        if (!message) {
            return res.status(404).send('Mensagem não encontrada!');
        }

        if (message.from !== from) {
            return res.sendStatus(401);
        }

        const updateMessage = await db
            .collection('messages')
            .updateOne({ _id: message._id }, { $set: { to, text, type } });
				
		return res.sendStatus(200);
        
    } catch (error) {
        
        res.sendStatus(500);

    }

});

app.post('/status', async (req, res) => {

    const { user : name } = req.headers;

    try {
        
        const user = await db.collection('participants').findOne({"name": name});
        let lastStatus = Date.now();

        if (!user) {
            return res.sendStatus(404);
        }

        await db.collection('participants').updateOne({"name": name}, {$set: {lastStatus}});

        return res.sendStatus(200);

    } catch (error) {
        
        return res.sendStatus(500);

    }
});

setInterval( async () => {

    const participants = await db.collection('participants').find().toArray();
    const inactiveUsers = participants.filter(user => Date.now() - user.lastStatus > 10000);

    inactiveUsers.map( async user => {
        try {

            const removeInactiveUsers = await db.collection('participants').deleteOne(user);

            const message = await db
                .collection('messages')
                .insertOne({
                    from: user.name, 
                    to: 'todos', 
                    text: 'sai da sala...', 
                    type: 'status', 
                    time: dayjs().format('h:mm:ss')
                });

        } catch (error) {
            
            console.log(error.message);

        }
    });
}, 15000);

app.listen(5000, () => console.log('listening on port 5000'));


