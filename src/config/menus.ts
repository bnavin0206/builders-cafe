export type { MenuItem, Menus, Order } from "@/types";
export { modes } from "@/types";
import type { Menus } from "@/types";

export default {
  // Builder's Cafe menu, from the client. It may change later.
  // Free (the quiz prize): Cappuccino, Americano, Masala Chai, Espresso.
  // Paid: drinks Rs 100 (water Rs 20); food Rs 100.
  // The same drink is listed twice, once free and once priced. The title is
  // what attendees see and what orders use; the shortTitle must be unique
  // because the dashboard's menu picker identifies items by it. Items are shown
  // to attendees in this order.
  barista: {
    items: [
      // Free with the quiz.
      {
        shortTitle: "Cappuccino (Free)",
        title: "Cappuccino",
        description: "Hot",
        category: "coffee",
        price: 0,
      },
      {
        shortTitle: "Americano (Free)",
        title: "Americano",
        description: "Hot",
        category: "coffee",
        price: 0,
      },
      {
        shortTitle: "Masala Chai (Free)",
        title: "Masala Chai",
        description: "Hot",
        category: "coffee",
        price: 0,
      },
      {
        shortTitle: "Espresso (Free)",
        title: "Espresso",
        description: "Hot",
        category: "coffee",
        price: 0,
      },
      // Drinks, Rs 100 (the four free coffees are sold here too); water is Rs 20 (a
      // "savoury" item so it gets no add-ons). Two groups, so each WhatsApp page
      // fits the 10-row limit with the other groups' rows and Done.
      {
        shortTitle: "Cappuccino",
        title: "Cappuccino",
        description: "Coffee",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Americano",
        title: "Americano",
        description: "Coffee",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Espresso",
        title: "Espresso",
        description: "Coffee",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Cafe Mocha",
        title: "Cafe Mocha",
        description: "Coffee",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Cafe Latte",
        title: "Cafe Latte",
        description: "Coffee",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Masala Chai",
        title: "Masala Chai",
        description: "Tea & More",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Elachi Chai",
        title: "Elachi Chai",
        description: "Tea & More",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Hot Chocolate",
        title: "Hot Chocolate",
        description: "Tea & More",
        category: "coffee",
        price: 100,
      },
      {
        shortTitle: "Water Bottle",
        title: "Water Bottle",
        description: "Tea & More",
        category: "savoury",
        price: 20,
      },
      // Food, Rs 100. In every section the veg items come first, then the non-veg ones.
      {
        shortTitle: "Mint Sandwich",
        title: "Mint Sandwich",
        description: "Sandwich",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Cheese Sandwich",
        title: "Cheese Sandwich",
        description: "Sandwich",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Potato Sandwich",
        title: "Potato Sandwich",
        description: "Sandwich",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Chicken Sandwich",
        title: "Chicken Sandwich",
        description: "Sandwich",
        category: "savoury",
        price: 100,
        veg: false,
      },
      {
        shortTitle: "Veg Puff",
        title: "Veg Puff",
        description: "Savoury",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Veg Spring Roll",
        title: "Veg Spring Roll",
        description: "Savoury",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Veg Cutlet",
        title: "Veg Cutlet",
        description: "Savoury",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Chicken Cutlet",
        title: "Chicken Cutlet",
        description: "Savoury",
        category: "savoury",
        price: 100,
        veg: false,
      },
      {
        shortTitle: "Chicken Puff",
        title: "Chicken Puff",
        description: "Savoury",
        category: "savoury",
        price: 100,
        veg: false,
      },
      {
        shortTitle: "Egg Puff",
        title: "Egg Puff",
        description: "Savoury",
        category: "savoury",
        price: 100,
        veg: false,
      },
      {
        shortTitle: "Cookies",
        title: "Cookies",
        description: "Pastry",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Danish",
        title: "Danish",
        description: "Pastry",
        category: "savoury",
        price: 100,
      },
      {
        shortTitle: "Apple Pie",
        title: "Apple Pie",
        description: "Pastry",
        category: "savoury",
        price: 100,
      },
    ],
    // Add-ons offered with the drinks. PLACEHOLDER list: the client confirms
    // the final sugar levels and other add-ons.
    modifiers: ["No sugar", "Less sugar", "Extra sugar", "Extra hot"],
  },
  smoothie: {
    items: [
      {
        title: "Macarena",
        shortTitle: "Macarena",
        description: "Strawberry, Pineapple, Apple, Passion Fruit, Goji, Vanilla 🍓🍍",
      },
      {
        title: "La Isla Bonita",
        shortTitle: "La Isla Bonita",
        description: "Pineapple, Banana, Coconut Milk, Dates, Blue Spirulina 🍍🍌🥥",
      },
      {
        title: "Calma",
        shortTitle: "Calma",
        description: "Mango, Pineapple, Spinach, Banana, Almonds, Ginger, Lemon 🥭🌿",
      },
      {
        title: "Des.pa.cito",
        shortTitle: "Des.pa.cito",
        description: "Green 🍏🍌🌿 with citrus zing 🍋",
      },
      {
        title: "Berry Burst",
        shortTitle: "Berry Burst",
        description: "Blackcurrant, blueberry, blackberry, banana & cranberry 🫐🍌",
      },
      {
        title: "Passion Storm",
        shortTitle: "Passion Storm",
        description: "Passionfruit, peach, pineapple, papaya & aloe vera 🍑🍍",
      },
      {
        title: "Mango Dream",
        shortTitle: "Mango Dream",
        description: "Mango, pear & pineapple 🥭🍍",
      },
      {
        title: "Strawberry Delight",
        shortTitle: "Strawberry Delight",
        description: "Strawberry, peach & papaya 🍓🍑",
      },
      {
        title: "Green Reviver",
        shortTitle: "Green Reviver",
        description: "Kale, lemongrass, banana & mango 🌿🍌🥭",
      },
      {
        title: "Ginger Beets",
        shortTitle: "Ginger Beets",
        description: "Ginger, beetroot, pineapple & blueberries 🫚🍍🫐",
      },
    ],
  },
  tea: {
    items: [
      {
        title: "Mango Black Tea with Boba",
        shortTitle: "Mango Black Tea",
        description: "Mango, Cane Sugar, Assam Black Tea, Boba 🥭🧋",
      },
      {
        title: "Lychee Peachy Green Tea",
        shortTitle: "Lychee Peachy Green Tea",
        description: "Lychee, Peach, Jasmine Green Tea, Lychee Jelly 🍑🍵",
      },
      {
        title: "Caramel Milk Tea",
        shortTitle: "Caramel Milk Tea",
        description: "Caramel, Oatmilk, Assam Black Tea 🍯🥛",
      },
      {
        title: "Matcha Latte",
        shortTitle: "Matcha Latte",
        description: "Matcha green tea blended with milk 🍵🥛",
      },
      {
        title: "Strawberry Matcha Latte",
        shortTitle: "Strawberry Matcha Latte",
        description: "Matcha, strawberry, and milk layered over ice 🍓🍵",
      },
      {
        title: "Strawberry Lemonade Tea",
        shortTitle: "Strawberry Lemonade Tea",
        description: "Strawberry and lemonade tea served chilled 🍓🍋",
      },
    ],
    modifiers: ["Lactose Free Whole Milk", "Oat Milk"],
  },
  waffles: {
    items: [
      {
        title: "Nuttello",
        shortTitle: "Nuttello",
        description: "Nutella drizzled over strawberries and ice cream",
      },
      {
        title: "Banoffo",
        shortTitle: "Banoffo",
        description: "Dulce de Leche over banana, Biscoff crumble and ice cream",
      },
      {
        title: "Oreo",
        shortTitle: "Oreo",
        description: "Dark chocolate drizzled over Oreo cookie crumble",
      },
      {
        title: "Snikero",
        shortTitle: "Snikero",
        description: "Dulce de Leche, chocolate, Snickers and crushed peanuts",
      },
      {
        title: "Vegan Delight",
        shortTitle: "Vegan Delight",
        description: "Strawberries, banana, Oreo crumble and maple syrup",
      },
    ],
    modifiers: ["Cream", "Ice Cream"],
  },
  cocktail: {
    items: [
      {
        title: "The SMSpresso - Espresso Martini",
        shortTitle: "Espresso Martini",
        description: "Vodka, Espresso, Coffee Liqueur, Sugar Syrup",
      },
      {
        title: "Hot White Russian",
        shortTitle: "Hot White Russian",
        description: "Vodka, Coffee Liqueur, Cream",
      },
      {
        title: "White Russian",
        shortTitle: "White Russian",
        description: "Coffee Liqueur, Vodka, Cream",
      },
      {
        title: "Irish Coffee",
        shortTitle: "Irish Coffee",
        description: "Espresso, Irish Whiskey, Raw Sugar, Fresh Cream",
      },
      {
        shortTitle: "Coffee",
        title: "Regular Coffee",
        description: "Brewed coffee, black",
      },
      {
        title: "The API Pour - Mudslide",
        shortTitle: "Mudslide",
        description: "Vodka, Coffee Liqueur, Irish Cream, Cream",
      },
      {
        shortTitle: "Espresso Martini",
        description: "Espresso, Vodka, Coffee Liqueur",
        title: "Espresso Martini",
      },
      {
        title: "Maracuia Fitzgerald",
        shortTitle: "Maracuia Fitzgerald",
        description: "Gin, limão siciliano e maracujá; cítrico e herbal",
      },
      {
        title: "Negroni",
        shortTitle: "Negroni",
        description: "Gin, vermute rosso e Campari; amargo e intenso",
      },
      {
        title: "Macunaíma",
        shortTitle: "Macunaíma",
        description: "Cachaça, limão Taiti e Fener; cítrico e levemente amargo",
      },
      {
        title: "Especiado (Não Alcoólico)",
        shortTitle: "Especiado",
        description:
          "Maracujá, especiarias e limão; cítrico, frutado e picante",
      },
      {
        title: "Verdejo (Não Alcoólico)",
        shortTitle: "Verdejo",
        description:
          "Chá de laranja, manjericão e limão; herbal e levemente doce",
      },
      {
        title: "Cosmopolitan",
        shortTitle: "Cosmo",
        description: "Vodka, Triple Sec, Cranberry Juice, Lime Juice",
      },
      {
        title: "Appletini",
        shortTitle: "Appletini",
        description: "Vodka, Apple Schnapps, Apple Juice",
      },
      {
        title: "Irish Lovers",
        shortTitle: "Irish Lovers",
        description:
          "Espresso, brown sugar, Jameson, topped with macadamia-infused cream",
      },
      {
        title: "Shakerato Lovers",
        shortTitle: "Shakerato Lovers",
        description:
          "Espresso shaken with ice, Leblon Cachaça, lemon syrup, sugarcane molasses",
      },
      {
        title: "Blue Gin Lovers",
        shortTitle: "Blue Gin Lovers",
        description:
          "Espresso, blue curaçao, tonic water and gin, garnished with lemon",
      },
    ],
    modifiers: ["Whipped Cream"],
  },
} as Menus;
