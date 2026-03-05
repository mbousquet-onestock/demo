
import { Product, AppSettings } from '../types';
import { CustomerIdentity } from './geminiService';

export interface OrderGenerationRequest {
  type: 'sfs' | 'ckc' | 'ropis';
  count: number;
  productsPerOrder: number;
  countryCode?: string;
  salesChannel?: string;
  parentOrderId: string;
  orderIdPrefix: string;
  startIndex: number;
  endpointId?: string;
}

const FALLBACK_COUNTRY_DATA: Record<string, { firstNames: string[], lastNames: string[], addresses: { city: string, zip_code: string, lines: string[] }[] }> = {
  FR: {
    firstNames: ["Jean", "Marie", "William", "Elena", "Lucas", "Sophie", "Inès", "Pablo", "Oliver", "Amelia", "Théo", "Léa", "Manon", "Gabriel"],
    lastNames: ["Dupont", "Lefebvre", "Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand"],
    addresses: [{ city: "Toulouse", zip_code: "31400", lines: ["8 Rue des Trente-Six Ponts"] }]
  },
  GB: {
    firstNames: ["James", "Mary", "Robert"],
    lastNames: ["Smith", "Jones", "Taylor"],
    addresses: [{ city: "London", zip_code: "W1U 1EE", lines: ["10-12 James St"] }]
  },
  ES: {
    firstNames: ["Antonio", "Maria", "Jose"],
    lastNames: ["Garcia", "Rodriguez", "Gonzalez"],
    addresses: [{ city: "Madrid", zip_code: "28001", lines: ["Calle de Serrano, 1"] }]
  }
};

const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const generateOrderPayloads = (
  request: OrderGenerationRequest,
  availableProducts: Product[],
  settings: AppSettings,
  aiIdentities?: CustomerIdentity[]
) => {
  const { siteId, token } = settings;
  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;
  
  const cutoff = now + (3600 * 4);
  const etaStart = now + (oneDay * 2);
  const etaEnd = now + (oneDay * 5);

  const parentIdValue = request.parentOrderId;
  const countryCode = request.countryCode || 'FR';
  const fallbackLocalData = FALLBACK_COUNTRY_DATA[countryCode] || FALLBACK_COUNTRY_DATA.FR;
  
  const mainAiIdentity = aiIdentities && aiIdentities.length > 0 ? aiIdentities[0] : null;
  const mainFirstName = mainAiIdentity ? mainAiIdentity.firstName : getRandom(fallbackLocalData.firstNames);
  const mainLastName = mainAiIdentity ? mainAiIdentity.lastName : getRandom(fallbackLocalData.lastNames);
  const mainTitle = mainAiIdentity ? mainAiIdentity.title : getRandom(['M.', 'Mme', 'Sir']);
  const mainEmail = `alertes_os@onestock-retail.com`; 
  const mainPhone = mainAiIdentity ? mainAiIdentity.phone : (countryCode === 'GB' ? '+44 7123456789' : '+33 612345678');
  
  const mainBillingAddress = mainAiIdentity ? mainAiIdentity.address : getRandom(fallbackLocalData.addresses);

  const orders: any[] = [];
  let totalParentPrice = 0;
  const currency = availableProducts[0]?.currency || "EUR";

  for (let i = 0; i < request.count; i++) {
    const currentAiId = aiIdentities && aiIdentities[i] ? aiIdentities[i] : null;
    const deliveryAddressData = currentAiId ? currentAiId.address : getRandom(fallbackLocalData.addresses);
    const salesChannel = request.salesChannel || getRandom(settings.orderSalesChannels);
    
    let subtotal = 0;
    const shuffled = [...availableProducts].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(request.productsPerOrder, availableProducts.length));

    const orderItems = selected.map(p => {
      const price = parseFloat(p.price) || 0;
      subtotal += price;
      return {
        item_id: p.sku,
        quantity: 1,
        pricing_details: {
          original_price: price,
          price: price,
          original_unit_price: price,
          unit_price: price
        },
        information: {}
      };
    });

    const shippingPrice = request.type === 'sfs' ? 10 : 0;
    const totalPrice = parseFloat((subtotal + shippingPrice).toFixed(2));
    totalParentPrice += totalPrice;
    
    const currentIndex = request.startIndex + i;
    const counter = currentIndex.toString().padStart(3, '0');
    const orderId = `${request.orderIdPrefix}${counter}`;
    
    let orderTypes: string[] = [];
    let deliveryMethod = "standard_hd";
    if (request.type === 'sfs') {
      orderTypes = ['ffs'];
      deliveryMethod = "standard_hd";
    } else if (request.type === 'ckc') {
      orderTypes = ['ffs', 'ckc'];
      deliveryMethod = "standard_ckc";
    } else {
      orderTypes = ['ropis'];
      deliveryMethod = "standard_ropis";
    }

    const orderPayload = {
      site_id: siteId,
      token: token,
      order: {
        id: orderId,
        parent_order_id: parentIdValue,
        types: orderTypes,
        sales_channel: salesChannel,
        date: now,
        delivery: {
          destination: {
            address: {
              city: deliveryAddressData.city,
              contact: {
                title: mainTitle,
                first_name: mainFirstName,
                last_name: mainLastName,
                phone_number: mainPhone,
                email: mainEmail
              },
              lines: deliveryAddressData.lines,
              regions: {
                country: {
                  code: countryCode
                }
              },
              zip_code: deliveryAddressData.zip_code
            },
            ...(request.type !== 'sfs' ? { endpoint_id: request.endpointId || getRandom(settings.stockEndpoints) } : {})
          },
          carrier: {
            name: "mock"
          },
          type: "standard"
        },
        delivery_promise: {
          original_delivery_option: {
            carbon_footprint: 100,
            cost: shippingPrice || 15,
            cutoff: cutoff,
            delivery_method: deliveryMethod,
            destination: {
              location: {
                country: countryCode,
                zip_code: deliveryAddressData.zip_code
              }
            },
            eta_end: etaEnd,
            eta_start: etaStart,
            shipment_number: 1,
            status: "valid"
          },
          sent_delivery_option: {
            eta_end: etaEnd,
            eta_start: etaStart
          }
        },
        customer: {
          email: mainEmail,
          first_name: mainFirstName,
          last_name: mainLastName,
          phone_number: mainPhone,
          title: "" 
        },
        pricing_details: {
          currency: currency,
          address: {
            city: mainBillingAddress.city,
            contact: {
              title: mainTitle,
              first_name: mainFirstName,
              last_name: mainLastName,
              phone_number: mainPhone,
              email: mainEmail
            },
            lines: mainBillingAddress.lines,
            regions: {
              country: {
                code: countryCode
              }
            },
            zip_code: mainBillingAddress.zip_code
          },
          price: totalPrice
        },
        order_items: orderItems,
        shipping_fees: [
          {
            original_price: shippingPrice,
            price: shippingPrice
          }
        ],
        ...(request.type === 'ckc' ? { sign_on_collect: true } : {})
      }
    };

    orders.push(orderPayload);
  }

  const parentOrderPayload = {
    site_id: siteId,
    token: token,
    parent_order: {
      id: parentIdValue,
      pricing_details: {
        price: parseFloat(totalParentPrice.toFixed(2)),
        currency
      }
    }
  };

  return {
    parent: parentOrderPayload,
    subOrders: orders
  };
};
