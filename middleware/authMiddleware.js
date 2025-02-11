import jwt from 'jsonwebtoken';

export const authenticateUser = (req, res, next) => {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
        req.user = decoded; // Attach the decoded user data to the request object
        next(); // Proceed to the next middleware/route handler
    } catch (error) {
        return res.status(400).json({ error: "Invalid token." });
    }
};

export const checkAdmin = (req, res, next) => {
    // Check if the user has the admin role
    if (!req.user.admin) {
        return res.status(403).json({ error: "Access denied. Admins only." });
    }

    // Proceed to the next middleware/route handler
    next();
};