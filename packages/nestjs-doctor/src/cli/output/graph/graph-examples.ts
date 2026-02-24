export function getRuleExamples(): Record<
	string,
	{ bad: string; good: string }
> {
	return {
		// ── Security ──
		"security/no-hardcoded-secrets": {
			bad: `@Injectable()
export class AuthService {
  private readonly apiKey = 'sk-1234567890abcdef';
  private readonly dbPassword = 'super_secret_password';
}`,
			good: `@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  getApiKey() {
    return this.config.get('API_KEY');
  }
}`,
		},
		"security/no-eval": {
			bad: `@Injectable()
export class CalcService {
  evaluate(expression: string) {
    return eval(expression);
  }
}`,
			good: `@Injectable()
export class CalcService {
  evaluate(expression: string) {
    return JSON.parse(expression);
  }
}`,
		},
		"security/no-csrf-disabled": {
			bad: `app.use(csurf({ cookie: false }));
// or
const csrfOptions = { csrf: false };`,
			good: "app.use(csurf({ cookie: true }));",
		},
		"security/no-dangerous-redirects": {
			bad: `@Get('redirect')
redirect(@Query('url') url: string, @Res() res: Response) {
  res.redirect(url);
}`,
			good: `@Get('redirect')
redirect(@Query('url') url: string, @Res() res: Response) {
  const allowed = ['https://example.com', 'https://app.example.com'];
  if (allowed.includes(url)) {
    res.redirect(url);
  }
}`,
		},
		"security/no-synchronize-in-production": {
			bad: `TypeOrmModule.forRoot({
  type: 'postgres',
  synchronize: true,
})`,
			good: `TypeOrmModule.forRoot({
  type: 'postgres',
  synchronize: false,
  // Use migrations instead
})`,
		},
		"security/no-weak-crypto": {
			bad: `import { createHash } from 'crypto';
const hash = createHash('md5').update(data).digest('hex');`,
			good: `import { createHash } from 'crypto';
const hash = createHash('sha256').update(data).digest('hex');`,
		},
		"security/no-exposed-env-vars": {
			bad: `@Injectable()
export class MailService {
  private readonly apiKey = process.env.MAIL_API_KEY;
}`,
			good: `@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  getApiKey() {
    return this.config.get('MAIL_API_KEY');
  }
}`,
		},
		"security/no-exposed-stack-trace": {
			bad: `@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    response.json({ message: exception.message, stack: exception.stack });
  }
}`,
			good: `@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    this.logger.error(exception.stack);
    response.json({ message: 'Internal server error' });
  }
}`,
		},
		"security/no-raw-entity-in-response": {
			bad: `@Controller('users')
export class UserController {
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userRepo.findOne(id); // Returns raw entity
  }
}`,
			good: `@Controller('users')
export class UserController {
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.userService.findOne(id);
    return new UserResponseDto(user); // Controlled shape
  }
}`,
		},

		// ── Correctness ──
		"correctness/no-missing-injectable": {
			bad: `// user.service.ts
export class UserService {  // Missing @Injectable()
  constructor(private readonly db: DatabaseService) {}
}

// user.module.ts
@Module({ providers: [UserService] })
export class UserModule {}`,
			good: `@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}
}`,
		},
		"correctness/no-duplicate-routes": {
			bad: `@Controller('users')
export class UserController {
  @Get(':id')
  findOne(@Param('id') id: string) { /* ... */ }

  @Get(':id')  // Duplicate!
  getUser(@Param('id') id: string) { /* ... */ }
}`,
			good: `@Controller('users')
export class UserController {
  @Get(':id')
  findOne(@Param('id') id: string) { /* ... */ }

  @Get(':id/profile')
  getProfile(@Param('id') id: string) { /* ... */ }
}`,
		},
		"correctness/no-missing-guard-method": {
			bad: `@Injectable()
export class AuthGuard implements CanActivate {
  // Missing canActivate()!
}`,
			good: `@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return this.validateRequest(context);
  }
}`,
		},
		"correctness/no-missing-pipe-method": {
			bad: `@Injectable()
export class ParseIntPipe implements PipeTransform {
  // Missing transform()!
}`,
			good: `@Injectable()
export class ParseIntPipe implements PipeTransform {
  transform(value: string): number {
    return parseInt(value, 10);
  }
}`,
		},
		"correctness/no-missing-filter-catch": {
			bad: `@Catch(HttpException)
export class HttpFilter implements ExceptionFilter {
  // Missing catch()!
}`,
			good: `@Catch(HttpException)
export class HttpFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    response.status(exception.getStatus()).json({ error: exception.message });
  }
}`,
		},
		"correctness/no-missing-interceptor-method": {
			bad: `@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  // Missing intercept()!
}`,
			good: `@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    console.log('Before...');
    return next.handle();
  }
}`,
		},
		"correctness/require-inject-decorator": {
			bad: `@Injectable()
export class UserService {
  constructor(private readonly connection) {} // No type, no @Inject()
}`,
			good: `@Injectable()
export class UserService {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private readonly connection: Connection,
  ) {}
}`,
		},
		"correctness/prefer-readonly-injection": {
			bad: `@Injectable()
export class UserService {
  constructor(private db: DatabaseService) {}
}`,
			good: `@Injectable()
export class UserService {
  constructor(private readonly db: DatabaseService) {}
}`,
		},
		"correctness/require-lifecycle-interface": {
			bad: `@Injectable()
export class AppService {
  onModuleInit() {  // No OnModuleInit interface
    // ...
  }
}`,
			good: `@Injectable()
export class AppService implements OnModuleInit {
  onModuleInit() {
    // ...
  }
}`,
		},
		"correctness/no-empty-handlers": {
			bad: `@Controller('users')
export class UserController {
  @Get()
  findAll() {}  // Empty body
}`,
			good: `@Controller('users')
export class UserController {
  @Get()
  findAll() {
    return this.userService.findAll();
  }
}`,
		},
		"correctness/no-async-without-await": {
			bad: `@Injectable()
export class UserService {
  async findAll() {
    return this.users;  // No await needed
  }
}`,
			good: `@Injectable()
export class UserService {
  findAll() {
    return this.users;
  }

  // Or, if async is needed:
  async findById(id: string) {
    return await this.db.user.findUnique({ where: { id } });
  }
}`,
		},
		"correctness/no-duplicate-module-metadata": {
			bad: `@Module({
  providers: [UserService, AuthService, UserService],  // Duplicate!
})
export class UserModule {}`,
			good: `@Module({
  providers: [UserService, AuthService],
})
export class UserModule {}`,
		},
		"correctness/no-missing-module-decorator": {
			bad: `export class UserModule {  // Missing @Module()
  // ...
}`,
			good: `@Module({
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}`,
		},
		"correctness/no-fire-and-forget-async": {
			bad: `@Injectable()
export class OrderService {
  complete(orderId: string) {
    this.notificationService.sendEmail(orderId);  // No await!
    this.analyticsService.track('order_completed');  // No await!
  }
}`,
			good: `@Injectable()
export class OrderService {
  async complete(orderId: string) {
    await this.notificationService.sendEmail(orderId);
    await this.analyticsService.track('order_completed');
  }
}`,
		},

		// ── Architecture ──
		"architecture/no-business-logic-in-controllers": {
			bad: `@Controller('orders')
export class OrderController {
  @Post()
  create(@Body() dto: CreateOrderDto) {
    const items = [];
    for (const item of dto.items) {  // Logic in controller
      if (item.quantity > 0) {
        items.push({ ...item, total: item.price * item.quantity });
      }
    }
    return this.orderRepo.save({ items });
  }
}`,
			good: `@Controller('orders')
export class OrderController {
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orderService.create(dto);
  }
}`,
		},
		"architecture/no-repository-in-controllers": {
			bad: `@Controller('users')
export class UserController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}
}`,
			good: `@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}
}`,
		},
		"architecture/no-orm-in-controllers": {
			bad: `@Controller('users')
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.user.findMany();
  }
}`,
			good: `@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll();
  }
}`,
		},
		"architecture/no-circular-module-deps": {
			bad: `// user.module.ts
@Module({ imports: [OrderModule] })
export class UserModule {}

// order.module.ts
@Module({ imports: [UserModule] })  // Circular!
export class OrderModule {}`,
			good: `// shared.module.ts — extract shared logic
@Module({ providers: [SharedService], exports: [SharedService] })
export class SharedModule {}

// user.module.ts
@Module({ imports: [SharedModule] })
export class UserModule {}

// order.module.ts
@Module({ imports: [SharedModule] })
export class OrderModule {}`,
		},
		"architecture/no-manual-instantiation": {
			bad: `@Injectable()
export class OrderService {
  processOrder() {
    const validator = new OrderValidator();  // Manual instantiation!
    validator.validate(order);
  }
}`,
			good: `@Injectable()
export class OrderService {
  constructor(private readonly validator: OrderValidator) {}

  processOrder() {
    this.validator.validate(order);
  }
}`,
		},
		"architecture/no-orm-in-services": {
			bad: `@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}
}`,
			good: `@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepository) {}
}`,
		},
		"architecture/no-service-locator": {
			bad: `@Injectable()
export class TaskService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async run() {
    const service = this.moduleRef.get(SomeService);
    service.doWork();
  }
}`,
			good: `@Injectable()
export class TaskService {
  constructor(private readonly someService: SomeService) {}

  async run() {
    this.someService.doWork();
  }
}`,
		},
		"architecture/prefer-constructor-injection": {
			bad: `@Injectable()
export class UserService {
  @Inject()
  private configService: ConfigService;
}`,
			good: `@Injectable()
export class UserService {
  constructor(private readonly configService: ConfigService) {}
}`,
		},
		"architecture/require-module-boundaries": {
			bad: `// In user module:
import { OrderValidator } from '../order/validators/order.validator';`,
			good: `// In user module:
import { OrderValidator } from '../order';
// Or better: inject via DI through the module system`,
		},
		"architecture/no-barrel-export-internals": {
			bad: `// user/index.ts
export { UserService } from './user.service';
export { UserRepository } from './user.repository';  // Internal!`,
			good: `// user/index.ts
export { UserService } from './user.service';
// UserRepository stays internal to the module`,
		},

		// ── Performance ──
		"performance/no-sync-io": {
			bad: `@Injectable()
export class ConfigService {
  loadConfig() {
    const data = readFileSync('config.json', 'utf-8');
    return JSON.parse(data);
  }
}`,
			good: `@Injectable()
export class ConfigService {
  async loadConfig() {
    const data = await readFile('config.json', 'utf-8');
    return JSON.parse(data);
  }
}`,
		},
		"performance/no-blocking-constructor": {
			bad: `@Injectable()
export class CacheService {
  constructor() {
    // Blocks startup
    for (let i = 0; i < 10000; i++) {
      this.cache.set(i, computeExpensiveValue(i));
    }
  }
}`,
			good: `@Injectable()
export class CacheService implements OnModuleInit {
  async onModuleInit() {
    // Runs after construction, non-blocking
    await this.warmCache();
  }
}`,
		},
		"performance/no-dynamic-require": {
			bad: `@Injectable()
export class PluginLoader {
  load(name: string) {
    return require(\`./plugins/\${name}\`);
  }
}`,
			good: `@Injectable()
export class PluginLoader {
  private readonly plugins = new Map<string, Plugin>();

  register(name: string, plugin: Plugin) {
    this.plugins.set(name, plugin);
  }

  load(name: string) {
    return this.plugins.get(name);
  }
}`,
		},
		"performance/no-unused-providers": {
			bad: `// Never injected anywhere
@Injectable()
export class LegacyService {
  doOldStuff() { /* ... */ }
}

@Module({ providers: [LegacyService, UserService] })
export class UserModule {}`,
			good: `// Remove unused provider
@Module({ providers: [UserService] })
export class UserModule {}`,
		},
		"performance/no-request-scope-abuse": {
			bad: `@Injectable({ scope: Scope.REQUEST })
export class UserService {
  // New instance created for EVERY request
}`,
			good: `@Injectable()  // Default singleton scope
export class UserService {
  // Single instance shared across all requests
}`,
		},
		"performance/no-unused-module-exports": {
			bad: `@Module({
  providers: [SharedService],
  exports: [SharedService],  // No other module imports SharedModule
})
export class SharedModule {}`,
			good: `// Either remove the export:
@Module({ providers: [SharedService] })
export class SharedModule {}

// Or import SharedModule where it's needed:
@Module({ imports: [SharedModule] })
export class UserModule {}`,
		},
		"performance/no-orphan-modules": {
			bad: `// analytics.module.ts — never imported anywhere
@Module({
  providers: [AnalyticsService],
})
export class AnalyticsModule {}`,
			good: `// Import it in the parent module:
@Module({
  imports: [AnalyticsModule],
})
export class AppModule {}`,
		},
	};
}
